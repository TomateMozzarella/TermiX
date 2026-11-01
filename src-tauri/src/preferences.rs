use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub schema_version: u8,
    pub setup_complete: bool,
    pub default_shell: String,
    pub font_size: u16,
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
                let value = serde_json::from_slice::<Preferences>(&bytes).map_err(|_| {
                    "Einstellungen konnten nicht gelesen werden. Die Datei wurde nicht verändert."
                })?;
                validate(&value)?;
                Ok(Some(value))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err("Einstellungen konnten nicht geladen werden.".into()),
        }
    }

    pub fn save(&self, value: Preferences) -> Result<Preferences, String> {
        validate(&value)?;
        let bytes = serde_json::to_vec_pretty(&value)
            .map_err(|_| "Einstellungen konnten nicht serialisiert werden.")?;
        // The command holds the store mutex. Write and sync a sibling temporary
        // file, then atomically replace; a failed write leaves old values intact.
        let temp = self.path.with_extension("json.tmp");
        let result = (|| -> std::io::Result<()> {
            use std::io::Write;
            let mut file = fs::File::create(&temp)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            drop(file);
            replace(&temp, &self.path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp);
            return Err(
                "Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.".into(),
            );
        }
        Ok(value)
    }
}

fn validate(value: &Preferences) -> Result<(), String> {
    if value.schema_version != 1 {
        return Err("Diese Version der Einstellungen wird nicht unterstützt.".into());
    }
    if !crate::terminal::profiles()
        .iter()
        .any(|p| p.id == value.default_shell)
    {
        return Err("Unbekanntes Terminalprofil.".into());
    }
    if !(11..=22).contains(&value.font_size) {
        return Err("Die Schriftgröße muss zwischen 11 und 22 liegen.".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: both paths are valid, NUL-terminated UTF-16 buffers for this call.
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn value() -> Preferences {
        Preferences {
            schema_version: 1,
            setup_complete: true,
            default_shell: crate::terminal::profiles()[0].id.into(),
            font_size: 15,
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
        invalid.schema_version = 2;
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
}
