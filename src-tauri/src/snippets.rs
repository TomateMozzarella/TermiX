use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::Path};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub text: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Library {
    pub schema_version: u8,
    pub entries: Vec<Snippet>,
}
fn validate(value: &Library) -> Result<(), String> {
    if value.schema_version != 1 || value.entries.len() > 100 {
        return Err("snippets_invalid".into());
    }
    let mut ids = std::collections::HashSet::new();
    for entry in &value.entries {
        let lower = entry.text.to_ascii_lowercase();
        if uuid::Uuid::parse_str(&entry.id).is_err()
            || !ids.insert(&entry.id)
            || entry.name.trim().is_empty()
            || entry.name.chars().count() > 80
            || entry.name.chars().any(char::is_control)
            || entry.text.trim().is_empty()
            || entry.text.len() > 4096
            || entry
                .text
                .chars()
                .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
        {
            return Err("snippets_invalid".into());
        }
        if lower.contains("private key-----")
            || [
                "password=",
                "password =",
                "passwd=",
                "token=",
                "api_key=",
                "secret=",
            ]
            .iter()
            .any(|s| lower.contains(s))
        {
            return Err("snippets_secret".into());
        }
    }
    Ok(())
}
pub fn read(path: &Path) -> Result<Library, String> {
    let value = match fs::read(path) {
        Ok(bytes) if bytes.len() <= 600_000 => {
            serde_json::from_slice(&bytes).map_err(|_| "snippets_invalid")?
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Library {
            schema_version: 1,
            entries: vec![],
        },
        _ => return Err("snippets_invalid".into()),
    };
    validate(&value)?;
    Ok(value)
}
pub fn read_import(path: &Path) -> Result<Library, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|file| file.take(600_001).read_to_end(&mut bytes))
        .map_err(|_| "snippets_invalid")?;
    if bytes.len() > 600_000 {
        return Err("snippets_invalid".into());
    }
    let value = serde_json::from_slice(&bytes).map_err(|_| "snippets_invalid")?;
    validate(&value)?;
    Ok(value)
}

pub fn merge(path: &Path, incoming: Library) -> Result<Library, String> {
    validate(&incoming)?;
    let _lock = lock(path)?;
    let mut current = read(path)?;
    for mut command in incoming.entries {
        if current
            .entries
            .iter()
            .any(|entry| entry.name == command.name && entry.text == command.text)
        {
            continue;
        }
        command.id = uuid::Uuid::new_v4().to_string();
        current.entries.push(command);
    }
    write(path, current)
}

pub fn save(path: &Path, value: Library) -> Result<Library, String> {
    let _lock = lock(path)?;
    write(path, value)
}

fn lock(path: &Path) -> Result<fs::File, String> {
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path.with_file_name("commands.lock"))
        .map_err(|_| "snippets_save_failed")?;
    lock.try_lock().map_err(|_| "snippets_save_failed")?;
    Ok(lock)
}

fn write(path: &Path, value: Library) -> Result<Library, String> {
    validate(&value)?;
    let bytes = serde_json::to_vec_pretty(&value).map_err(|_| "snippets_invalid")?;
    if bytes.len() > 600_000 {
        return Err("snippets_invalid".into());
    }
    crate::atomic::write(path, &bytes).map_err(|_| "snippets_save_failed")?;
    Ok(value)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_commands_merge_without_replacing_existing_entries() {
        let dir = std::env::temp_dir().join(format!("termix-snippets-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("commands.json");
        let first = Snippet {
            id: uuid::Uuid::new_v4().to_string(),
            name: "First".into(),
            text: "echo first".into(),
        };
        save(
            &path,
            Library {
                schema_version: 1,
                entries: vec![first.clone()],
            },
        )
        .unwrap();
        let second = Snippet {
            id: first.id.clone(),
            name: "Second".into(),
            text: "echo second".into(),
        };
        let result = merge(
            &path,
            Library {
                schema_version: 1,
                entries: vec![second],
            },
        )
        .unwrap();
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.entries[0].id, first.id);
        assert_ne!(result.entries[1].id, first.id);
        let duplicate = merge(
            &path,
            Library {
                schema_version: 1,
                entries: vec![first],
            },
        )
        .unwrap();
        assert_eq!(duplicate.entries.len(), 2);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn commands_survive_relaunch_and_invalid_or_secret_values_do_not_replace_them() {
        let dir = std::env::temp_dir().join(format!("termix-snippets-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("commands.json");
        let mut library = read(&path).unwrap();
        library.entries.push(Snippet {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Update packages".into(),
            text: "sudo apt update".into(),
        });
        save(&path, library.clone()).unwrap();
        assert_eq!(read(&path).unwrap().entries[0].text, "sudo apt update");
        let before = fs::read(&path).unwrap();
        library.entries[0].text = "password=do-not-save".into();
        assert!(save(&path, library).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(dir).unwrap();
    }
}
