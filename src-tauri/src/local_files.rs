use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

const LIMIT: usize = 1000;

#[derive(Serialize)]
pub struct Entry {
    name: String,
    directory: bool,
    size: Option<u64>,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    path: String,
    can_go_up: bool,
    truncated: bool,
    entries: Vec<Entry>,
}

pub struct Browser {
    root: PathBuf,
    current: PathBuf,
    entries: Vec<(String, PathBuf, bool)>,
}

pub(crate) fn safe_directory(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.is_dir() && !is_link(&meta))
}

pub(crate) fn is_link(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Also excludes junctions and other Windows reparse points.
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    meta.file_type().is_symlink()
}

#[cfg(windows)]
pub fn open_verified_file(path: &Path) -> Result<fs::File, String> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::{FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ};
    // Open the selected file once. Validate the final name of that handle before transfer,
    // so changing a directory or replacing the file by a junction cannot redirect the upload.
    let file = fs::OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| "sftp_local")?;
    let metadata = file.metadata().map_err(|_| "sftp_local")?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err("sftp_type".into());
    }
    verify_windows_path(&file, path)?;
    Ok(file)
}

#[cfg(not(windows))]
pub fn open_verified_file(path: &Path) -> Result<fs::File, String> {
    let file = fs::File::open(path).map_err(|_| "sftp_local")?;
    if !file.metadata().map_err(|_| "sftp_local")?.is_file() {
        return Err("sftp_type".into());
    }
    Ok(file)
}

impl Browser {
    pub fn upload_file(&self, token: &str) -> Result<(String, fs::File), String> {
        let (_, path, _) = self
            .entries
            .iter()
            .find(|(id, _, directory)| id == token && !directory)
            .ok_or("sftp_local")?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("sftp_local")?;
        Ok((name.to_owned(), open_verified_file(path)?))
    }

    pub fn upload_folder(&self, token: &str) -> Result<PathBuf, String> {
        let (_, path, _) = self
            .entries
            .iter()
            .find(|(id, _, directory)| id == token && *directory)
            .ok_or("sftp_local")?;
        Ok(path.clone())
    }

    pub fn open(path: PathBuf) -> Result<(Self, Listing), String> {
        if !safe_directory(&path) {
            return Err("sftp_local".into());
        }
        let root = fs::canonicalize(path).map_err(|_| "sftp_local")?;
        let mut browser = Self {
            current: root.clone(),
            root,
            entries: Vec::new(),
        };
        let listing = browser.navigate(None, false, None)?;
        Ok((browser, listing))
    }

    pub fn current_directory(&self) -> Result<PathBuf, String> {
        if !safe_directory(&self.current)
            || fs::canonicalize(&self.current).map_err(|_| "sftp_local")? != self.current
        {
            return Err("sftp_local".into());
        }
        Ok(PathBuf::from(windows_display_path(&self.current)))
    }

    pub fn navigate(
        &mut self,
        token: Option<&str>,
        up: bool,
        typed_path: Option<&Path>,
    ) -> Result<Listing, String> {
        let typed_candidate;
        let candidate = if let Some(path) = typed_path {
            let display_root = PathBuf::from(windows_display_path(&self.root));
            let relative = path
                .strip_prefix(&display_root)
                .map_err(|_| "sftp_local_scope")?;
            if relative
                .components()
                .any(|component| !matches!(component, std::path::Component::Normal(_)))
            {
                return Err("sftp_local_scope".into());
            }
            typed_candidate = self.root.join(relative);
            &typed_candidate
        } else if let Some(token) = token {
            &self
                .entries
                .iter()
                .find(|(id, _, directory)| id == token && *directory)
                .ok_or("sftp_local")?
                .1
        } else if up && self.current != self.root {
            self.current.parent().ok_or("sftp_local")?
        } else {
            &self.current
        };
        let relative = candidate
            .strip_prefix(&self.root)
            .map_err(|_| "sftp_local")?;
        let mut current = self.root.clone();
        if !safe_directory(&current) {
            return Err("sftp_local".into());
        }
        for component in relative.components() {
            current.push(component);
            if !safe_directory(&current) {
                return Err("sftp_local".into());
            }
        }
        if fs::canonicalize(&current).map_err(|_| "sftp_local")? != current {
            return Err("sftp_local".into());
        }
        let mut entries = Vec::new();
        let mut tokens = Vec::new();
        let mut truncated = false;
        for (index, child) in fs::read_dir(&current)
            .map_err(|_| "sftp_local")?
            .enumerate()
        {
            if index == LIMIT {
                truncated = true;
                break;
            }
            let Ok(child) = child else { continue };
            let path = child.path();
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            if is_link(&meta) || !(meta.is_dir() || meta.is_file()) {
                continue;
            }
            let Some(name) = child.file_name().into_string().ok() else {
                continue;
            };
            let directory = meta.is_dir();
            let token = uuid::Uuid::new_v4().to_string();
            tokens.push((token.clone(), path, directory));
            entries.push(Entry {
                name,
                directory,
                size: (!directory).then(|| meta.len()),
                token,
            });
        }
        entries.sort_by(|a, b| {
            b.directory
                .cmp(&a.directory)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        let display_path = windows_display_path(&current);
        let can_go_up = current != self.root;
        self.current = current;
        self.entries = tokens;
        Ok(Listing {
            path: display_path,
            can_go_up,
            truncated,
            entries,
        })
    }
}

fn windows_display_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        path.strip_prefix(r"\\?\").unwrap_or(&path).to_owned()
    }
}

#[cfg(windows)]
fn verify_windows_path(file: &fs::File, path: &Path) -> Result<(), String> {
    use std::os::windows::{ffi::OsStringExt, io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::GetFinalPathNameByHandleW;
    let mut target = vec![0u16; 32768];
    // SAFETY: The owned file handle is open and target is writable for the supplied length.
    let length = unsafe {
        GetFinalPathNameByHandleW(
            file.as_raw_handle().cast(),
            target.as_mut_ptr(),
            target.len() as u32,
            0,
        )
    } as usize;
    if length == 0
        || length >= target.len()
        || PathBuf::from(std::ffi::OsString::from_wide(&target[..length])) != *path
    {
        return Err("sftp_local".into());
    }
    Ok(())
}

pub fn open_download_part(path: &Path) -> Result<fs::File, String> {
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;
        options
            .share_mode(0)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    // Opening an existing part never truncates it. The caller must validate its contents.
    let file = match options.create_new(true).open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if !fs::symlink_metadata(path).is_ok_and(|meta| meta.is_file() && !is_link(&meta)) {
                return Err("sftp_type".into());
            }
            options
                .create_new(false)
                .open(path)
                .map_err(|_| "sftp_local")?
        }
        Err(_) => return Err("sftp_local".into()),
    };
    let metadata = file.metadata().map_err(|_| "sftp_local")?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err("sftp_type".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        };
        verify_windows_path(&file, path)?;
        let mut info = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
        // SAFETY: the file handle is open and the output buffer has the required size.
        if unsafe { GetFileInformationByHandle(file.as_raw_handle().cast(), info.as_mut_ptr()) }
            == 0
            || unsafe { info.assume_init() }.nNumberOfLinks != 1
        {
            return Err("sftp_type".into());
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() != 1 || fs::canonicalize(path).map_err(|_| "sftp_local")? != path {
            return Err("sftp_type".into());
        }
    }
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_paths_keep_navigation_inside_the_selected_folder() {
        let root = std::env::temp_dir().join(format!("termix-local-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("docs")).unwrap();
        let (mut browser, listing) = Browser::open(root.clone()).unwrap();
        let display_root = PathBuf::from(listing.path);
        let docs = browser
            .navigate(None, false, Some(&display_root.join("docs")))
            .unwrap();
        assert!(docs.can_go_up);
        let current = browser.current_directory().unwrap();
        assert_eq!(current, display_root.join("docs"));
        assert!(browser
            .navigate(None, false, Some(&display_root.join("..")))
            .is_err());
        assert!(browser
            .navigate(None, false, display_root.parent())
            .is_err());
        assert_eq!(browser.current_directory().unwrap(), current);
        fs::remove_dir_all(root).unwrap();
    }
}
