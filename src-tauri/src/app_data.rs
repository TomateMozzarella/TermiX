use std::path::{Path, PathBuf};
use tauri::Manager;
pub fn portable_root(executable: &Path) -> Option<PathBuf> {
    executable
        .parent()
        .filter(|p| p.join("portable.flag").is_file())
        .map(Path::to_path_buf)
}
pub fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(root) = std::env::current_exe().ok().and_then(|p| portable_root(&p)) {
        return Ok(root.join("data"));
    }
    app.path()
        .app_data_dir()
        .map_err(|_| "preferences_invalid".into())
}
#[cfg(test)]
mod tests {
    #[test]
    fn marker_selects_only_the_executable_directory() {
        let dir = std::env::temp_dir().join(format!("termix-portable-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        assert!(super::portable_root(&dir.join("termix.exe")).is_none());
        std::fs::write(dir.join("portable.flag"), "").unwrap();
        assert_eq!(
            super::portable_root(&dir.join("termix.exe")),
            Some(dir.clone())
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
