use std::{fs, io::Write, path::Path};

pub fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
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
    let src: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let dst: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: valid NUL-terminated UTF-16 buffers live for the complete call.
    if unsafe {
        MoveFileExW(
            src.as_ptr(),
            dst.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}
