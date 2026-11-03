use std::path::{Path, PathBuf};

pub fn validate_path(path: &str, require_file: bool) -> Result<(), String> {
    if path.len() > 4096 || path.chars().any(char::is_control) || !Path::new(path).is_absolute() {
        return Err("invalid_editor".into());
    }
    if require_file
        && (!Path::new(path).is_file()
            || (cfg!(windows)
                && !Path::new(path)
                    .extension()
                    .and_then(|s| s.to_str())
                    .is_some_and(|s| s.eq_ignore_ascii_case("exe"))))
    {
        return Err("editor_file_missing".into());
    }
    Ok(())
}

/// Inspect a bounded set of paths; never execute an editor, a shell or a scan.
pub fn detect(editor: &str) -> Result<Option<String>, String> {
    let executable = match editor {
        "notepad++" => "notepad++.exe",
        "vscode" => "Code.exe",
        _ => return Err("invalid_editor".into()),
    };
    let mut candidates = Vec::new();
    #[cfg(windows)]
    {
        if let Some(path) = registered_path(executable) {
            candidates.push(path);
        }
        for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(root) = std::env::var_os(key) {
                let root = PathBuf::from(root);
                if editor == "notepad++" {
                    candidates.push(root.join("Notepad++").join(executable));
                } else {
                    candidates.push(root.join("Microsoft VS Code").join(executable));
                    candidates.push(root.join("Programs/Microsoft VS Code").join(executable));
                }
            }
        }
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for path in std::env::split_paths(&paths)
            .take(256)
            .filter(|p| p.is_absolute())
        {
            candidates.push(path.join(executable));
            if editor == "vscode" && path.file_name().is_some_and(|p| p == "bin") {
                if let Some(parent) = path.parent() {
                    candidates.push(parent.join(executable));
                }
            }
        }
    }
    Ok(first_existing(candidates))
}
fn first_existing(candidates: Vec<PathBuf>) -> Option<String> {
    candidates
        .into_iter()
        .find(|p| p.is_absolute() && p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(windows)]
fn registered_path(executable: &str) -> Option<PathBuf> {
    use windows_sys::Win32::System::Registry::*;
    let key = format!("Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{executable}\0")
        .encode_utf16()
        .collect::<Vec<_>>();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [RRF_SUBKEY_WOW6464KEY, RRF_SUBKEY_WOW6432KEY] {
            let mut value = vec![0u16; 32768];
            let mut bytes = (value.len() * 2) as u32;
            // SAFETY: registry value is read into a bounded writable UTF-16 buffer.
            let result = unsafe {
                RegGetValueW(
                    root,
                    key.as_ptr(),
                    std::ptr::null(),
                    RRF_RT_REG_SZ | view,
                    std::ptr::null_mut(),
                    value.as_mut_ptr().cast(),
                    &mut bytes,
                )
            };
            if result == 0 {
                if let Some(length) = value.iter().position(|c| *c == 0) {
                    if let Ok(value) = String::from_utf16(&value[..length]) {
                        let path = PathBuf::from(value);
                        if path.is_absolute() && path.is_file() {
                            return Some(path);
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    #[test]
    fn discovery_checks_files_without_starting_them_and_manual_paths_are_validated() {
        let dir = std::env::temp_dir().join(format!("termix-editor-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let editor = dir.join("editor.exe");
        std::fs::write(
            &editor,
            b"not an executable; discovery must never run this file",
        )
        .unwrap();
        assert_eq!(
            super::first_existing(vec![dir.join("missing.exe"), editor.clone()]),
            Some(editor.to_string_lossy().into_owned())
        );
        assert!(super::validate_path(&editor.to_string_lossy(), true).is_ok());
        assert!(super::validate_path("relative.exe", true).is_err());
        assert!(super::validate_path(&dir.join("missing.exe").to_string_lossy(), true).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
