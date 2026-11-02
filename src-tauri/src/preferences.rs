use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub schema_version: u8,
    pub setup_complete: bool,
    pub default_shell: String,
    pub font_size: u16,
    #[serde(default)]
    pub setup_version: u8,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_accent")]
    pub accent: String,
    #[serde(default = "default_editor")]
    pub editor: String,
    #[serde(default)]
    pub editor_path: String,
}

fn default_language() -> String {
    "en".into()
}
fn default_theme() -> String {
    "system".into()
}
fn default_accent() -> String {
    "#71c9bd".into()
}
fn default_editor() -> String {
    "integrated".into()
}

pub struct PreferencesStore {
    path: PathBuf,
}

impl PreferencesStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn read(&self) -> Result<Option<Preferences>, String> {
        match fs::read(&self.path) {
            Ok(bytes) => {
                let mut value = serde_json::from_slice::<Preferences>(&bytes)
                    .map_err(|_| "preferences_invalid")?;
                if value.schema_version == 1 {
                    value.schema_version = 2;
                }
                validate(&value)?;
                Ok(Some(value))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err("preferences_read_failed".into()),
        }
    }

    pub fn save(&self, value: Preferences) -> Result<Preferences, String> {
        validate(&value)?;
        let bytes = serde_json::to_vec_pretty(&value).map_err(|_| "preferences_save_failed")?;
        crate::atomic::write(&self.path, &bytes).map_err(|_| "preferences_save_failed")?;
        Ok(value)
    }
}

fn validate(value: &Preferences) -> Result<(), String> {
    if value.schema_version != 2 || value.setup_version > 2 {
        return Err("preferences_version".into());
    }
    if !crate::terminal::profiles()
        .iter()
        .any(|p| p.id == value.default_shell)
    {
        return Err("invalid_profile".into());
    }
    if !(11..=22).contains(&value.font_size) {
        return Err("invalid_font".into());
    }
    if !["en", "de"].contains(&value.language.as_str())
        || !["system", "dark", "light"].contains(&value.theme.as_str())
    {
        return Err("preferences_invalid".into());
    }
    if value.accent.len() != 7
        || !value.accent.starts_with('#')
        || !value.accent[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err("invalid_accent".into());
    }
    if !["integrated", "notepad++", "vscode", "custom"].contains(&value.editor.as_str())
        || value.editor_path.len() > 4096
        || value.editor_path.chars().any(|c| c.is_control())
    {
        return Err("invalid_editor".into());
    }
    if value.editor == "custom" && !PathBuf::from(&value.editor_path).is_absolute() {
        return Err("invalid_editor".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn value() -> Preferences {
        Preferences {
            schema_version: 2,
            setup_complete: true,
            default_shell: crate::terminal::profiles()[0].id.into(),
            font_size: 15,
            setup_version: 2,
            language: default_language(),
            theme: default_theme(),
            accent: default_accent(),
            editor: default_editor(),
            editor_path: String::new(),
        }
    }
    #[test]
    fn missing_preferences_then_repeated_save_and_reload() {
        let dir = std::env::temp_dir().join(format!("termix-settings-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let store = PreferencesStore::new(dir.join("preferences.json"));
        assert_eq!(store.read().unwrap(), None);
        store.save(value()).unwrap();
        let mut updated = value();
        updated.font_size = 18;
        store.save(updated.clone()).unwrap();
        assert_eq!(
            PreferencesStore::new(dir.join("preferences.json"))
                .read()
                .unwrap(),
            Some(updated)
        );
        let content = fs::read_to_string(&store.path).unwrap();
        assert!(!content.contains("password"));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_invalid_values_without_overwriting() {
        let dir = std::env::temp_dir().join(format!("termix-settings-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let store = PreferencesStore::new(dir.join("preferences.json"));
        store.save(value()).unwrap();
        let mut invalid = value();
        invalid.default_shell = "cmd /c something".into();
        assert!(store.save(invalid).is_err());
        let mut invalid = value();
        invalid.font_size = 100;
        assert!(store.save(invalid).is_err());
        let mut invalid = value();
        invalid.schema_version = 3;
        assert!(store.save(invalid).is_err());
        assert_eq!(store.read().unwrap(), Some(value()));
        fs::write(&store.path, b"corrupt").unwrap();
        assert!(store.read().is_err());
        assert_eq!(fs::read(&store.path).unwrap(), b"corrupt");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn reports_write_failure() {
        let store = PreferencesStore::new(
            std::env::temp_dir()
                .join(uuid::Uuid::new_v4().to_string())
                .join("missing/preferences.json"),
        );
        assert!(store.save(value()).is_err());
    }
    #[test]
    fn legacy_preferences_migrate_in_memory_without_losing_choices() {
        let dir = std::env::temp_dir().join(format!("termix-settings-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let store = PreferencesStore::new(dir.join("preferences.json"));
        let legacy = serde_json::json!({ "schemaVersion":1, "setupComplete":true, "defaultShell":crate::terminal::profiles()[0].id, "fontSize":18 });
        let bytes = serde_json::to_vec(&legacy).unwrap();
        fs::write(&store.path, &bytes).unwrap();
        let migrated = store.read().unwrap().unwrap();
        assert_eq!(migrated.schema_version, 2);
        assert_eq!(migrated.font_size, 18);
        assert_eq!(migrated.language, "en");
        assert_eq!(migrated.theme, "system");
        assert_eq!(migrated.setup_version, 0);
        assert_eq!(fs::read(&store.path).unwrap(), bytes);
        let mut bad = migrated.clone();
        bad.accent = "url(bad)".into();
        assert!(store.save(bad).is_err());
        let mut bad = migrated.clone();
        bad.language = "unknown".into();
        assert!(store.save(bad).is_err());
        let mut bad = migrated.clone();
        bad.theme = "unknown".into();
        assert!(store.save(bad).is_err());
        let mut bad = migrated;
        bad.editor = "custom".into();
        bad.editor_path = "relative.exe".into();
        assert!(store.save(bad).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
