use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tab {
    pub session_id: Option<String>,
    pub profile: Option<String>,
    pub pinned: bool,
    pub color: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workspace {
    pub schema_version: u8,
    pub tabs: Vec<Tab>,
    pub active: usize,
    pub sidebar_width: u16,
    pub files_width: u16,
    pub vertical_split: bool,
}
fn validate(w: &Workspace) -> Result<(), String> {
    if w.schema_version != 1
        || w.tabs.len() > 16
        || w.active > 15
        || !(230..=1200).contains(&w.sidebar_width)
        || !(280..=1600).contains(&w.files_width)
    {
        return Err("workspace_invalid".into());
    }
    for tab in &w.tabs {
        if tab.session_id.is_some() == tab.profile.is_some() {
            return Err("workspace_invalid".into());
        }
        if let Some(id) = &tab.session_id {
            if id.is_empty() || id.len() > 128 || id.chars().any(|c| c.is_control()) {
                return Err("workspace_invalid".into());
            }
        }
        if let Some(profile) = &tab.profile {
            if !crate::terminal::profiles().iter().any(|p| p.id == profile) {
                return Err("invalid_profile".into());
            }
        }
        if let Some(color) = &tab.color {
            if color.len() != 7
                || !color.starts_with('#')
                || !color[1..].chars().all(|c| c.is_ascii_hexdigit())
            {
                return Err("workspace_invalid".into());
            }
        }
    }
    Ok(())
}
pub fn read(path: &Path) -> Result<Option<Workspace>, String> {
    match fs::read(path) {
        Ok(bytes) if bytes.len() <= 16384 => {
            let value = serde_json::from_slice(&bytes).map_err(|_| "workspace_invalid")?;
            validate(&value)?;
            Ok(Some(value))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        _ => Err("workspace_invalid".into()),
    }
}
pub fn save(path: &Path, value: Workspace) -> Result<(), String> {
    validate(&value)?;
    let bytes = serde_json::to_vec(&value).map_err(|_| "workspace_invalid")?;
    crate::atomic::write(path, &bytes).map_err(|_| "workspace_save_failed".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_rejects_invalid_write_without_changing_previous_layout() {
        let dir = std::env::temp_dir().join(format!("termix-workspace-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("workspace.json");
        assert!(read(&path).unwrap().is_none());
        let mut value = Workspace {
            schema_version: 1,
            tabs: vec![Tab {
                session_id: Some("server-ref".into()),
                profile: None,
                pinned: true,
                color: Some("#71c9bd".into()),
            }],
            active: 0,
            sidebar_width: 350,
            files_width: 400,
            vertical_split: true,
        };
        save(&path, value.clone()).unwrap();
        let before = fs::read(&path).unwrap();
        let loaded = read(&path).unwrap().unwrap();
        assert_eq!(loaded.tabs[0].session_id.as_deref(), Some("server-ref"));
        assert_eq!(loaded.sidebar_width, 350);
        value.sidebar_width = 0;
        assert!(save(&path, value).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn workspace_only_accepts_bounded_references_and_profiles() {
        let mut value = Workspace {
            schema_version: 1,
            tabs: vec![Tab {
                session_id: None,
                profile: Some(crate::terminal::profiles()[0].id.into()),
                pinned: false,
                color: None,
            }],
            active: 0,
            sidebar_width: 310,
            files_width: 390,
            vertical_split: false,
        };
        assert!(validate(&value).is_ok());
        value.tabs[0].profile = Some("powershell -Command secret".into());
        assert!(validate(&value).is_err());
        value.tabs.clear();
        value.tabs.resize(
            17,
            Tab {
                session_id: Some("id".into()),
                profile: None,
                pinned: false,
                color: None,
            },
        );
        assert!(validate(&value).is_err());
        assert!(serde_json::from_str::<Workspace>(r#"{"schemaVersion":1,"tabs":[],"active":0,"sidebarWidth":310,"filesWidth":390,"verticalSplit":false,"password":"reject"}"#).is_err());
    }
}
