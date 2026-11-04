//! Session-bound UTF-8 documents. No frontend-provided local paths or executable arguments.
use crate::{
    sftp::{path, retry},
    ssh::SshTerminal,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
};
const MAX: usize = 2 * 1024 * 1024;
#[derive(Default)]
pub struct Documents(pub Mutex<HashMap<String, Document>>);
pub struct Document {
    path: PathBuf,
    hash: String,
    mode: i32,
    local: Option<PathBuf>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub token: String,
    pub path: String,
    pub text: String,
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn read(
    terminal: &SshTerminal,
    sftp: &ssh2::Sftp,
    remote: &std::path::Path,
) -> Result<(Vec<u8>, i32), String> {
    let stat = retry(terminal, None, || sftp.lstat(remote))?;
    if stat.perm.unwrap_or(0) & 0o170000 != 0o100000 || stat.size.unwrap_or(u64::MAX) > MAX as u64 {
        return Err("editor_type".into());
    }
    let mut handle = crate::sftp::Handle {
        file: retry(terminal, None, || sftp.open(remote))?,
        terminal,
    };
    let mut bytes = Vec::new();
    let mut buffer = vec![0; 32768];
    loop {
        let n = crate::sftp::io_retry(terminal, None, || handle.read(&mut buffer))?;
        if n == 0 {
            break;
        }
        if bytes.len() + n > MAX {
            return Err("editor_type".into());
        }
        bytes.extend_from_slice(&buffer[..n]);
    }
    Ok((bytes, (stat.perm.unwrap_or(0o600) & 0o777) as i32))
}
pub fn open(terminal: &SshTerminal, value: &str) -> Result<View, String> {
    let _gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
    let mut documents = terminal.documents.0.lock().map_err(|_| "ssh_state")?;
    if documents.len() >= 8 {
        return Err("editor_limit".into());
    }
    let mut subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
    if subsystem.is_none() {
        *subsystem = Some(retry(terminal, None, || terminal.ssh_session().sftp())?);
    }
    let sftp = subsystem.as_ref().ok_or("sftp_failed")?;
    let requested = path(value)?;
    // Reject a symlink before canonicalization; never silently edit its target.
    let (bytes, mode) = read(terminal, sftp, &requested)?;
    let remote = retry(terminal, None, || sftp.realpath(&requested))?;
    let (canonical_bytes, _) = read(terminal, sftp, &remote)?;
    if digest(&bytes) != digest(&canonical_bytes) {
        return Err("editor_conflict".into());
    }
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| "editor_encoding")?
        .to_owned();
    if text.contains('\0') {
        return Err("editor_encoding".into());
    }
    let token = uuid::Uuid::new_v4().to_string();
    let name = remote.to_str().ok_or("sftp_path")?.replace('\\', "/");
    documents.insert(
        token.clone(),
        Document {
            path: remote,
            hash: digest(&bytes),
            mode,
            local: None,
        },
    );
    Ok(View {
        token,
        path: name,
        text,
    })
}
pub fn save(terminal: &SshTerminal, token: &str, text: String) -> Result<(), String> {
    if text.len() > MAX || text.contains('\0') {
        return Err("editor_type".into());
    }
    let _gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
    let mut docs = terminal.documents.0.lock().map_err(|_| "ssh_state")?;
    let document = docs.get_mut(token).ok_or("editor_closed")?;
    let subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
    let sftp = subsystem.as_ref().ok_or("sftp_failed")?;
    let (before, _) = read(terminal, sftp, &document.path)?;
    if digest(&before) != document.hash {
        return Err("editor_conflict".into());
    }
    let parent = document
        .path
        .parent()
        .and_then(|p| p.to_str())
        .ok_or("sftp_path")?
        .replace('\\', "/");
    let temporary = path(&format!("{parent}/.termix-{}.part", uuid::Uuid::new_v4()))?;
    let mut handle = crate::sftp::Handle {
        file: retry(terminal, None, || {
            sftp.open_mode(
                &temporary,
                ssh2::OpenFlags::WRITE | ssh2::OpenFlags::CREATE | ssh2::OpenFlags::EXCLUSIVE,
                document.mode,
                ssh2::OpenType::File,
            )
        })?,
        terminal,
    };
    let result = (|| -> Result<(), String> {
        let mut offset = 0;
        while offset < text.len() {
            let end = (offset + 65536).min(text.len());
            let n = crate::sftp::io_retry(terminal, None, || {
                handle.write(&text.as_bytes()[offset..end])
            })?;
            if n == 0 {
                return Err("sftp_failed".into());
            }
            offset += n;
        }
        retry(terminal, None, || handle.close())?;
        let (now, _) = read(terminal, sftp, &document.path)?;
        if digest(&now) != document.hash {
            return Err("editor_conflict".into());
        }
        retry(terminal, None, || {
            sftp.rename(
                &temporary,
                &document.path,
                Some(
                    ssh2::RenameFlags::ATOMIC
                        | ssh2::RenameFlags::OVERWRITE
                        | ssh2::RenameFlags::NATIVE,
                ),
            )
        })?;
        document.hash = digest(text.as_bytes());
        Ok(())
    })();
    drop(handle);
    if result.is_err() {
        let _ = retry(terminal, None, || sftp.unlink(&temporary));
    }
    result
}
pub fn close(terminal: &SshTerminal, token: &str) -> Result<(), String> {
    if let Some(document) = terminal
        .documents
        .0
        .lock()
        .map_err(|_| "ssh_state")?
        .remove(token)
    {
        if let Some(file) = document.local {
            let parent = file.parent().map(|p| p.to_path_buf());
            let _ = std::fs::remove_file(file);
            if let Some(dir) = parent {
                let _ = std::fs::remove_dir(dir);
            }
        }
    }
    Ok(())
}
pub fn external(terminal: &SshTerminal, token: &str, executable: String) -> Result<(), String> {
    let _gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
    crate::editors::validate_path(&executable, true)?;
    let mut docs = terminal.documents.0.lock().map_err(|_| "ssh_state")?;
    let doc = docs.get_mut(token).ok_or("editor_closed")?;
    if doc.local.is_some() {
        return Err("editor_external_open".into());
    }
    // The OS per-user temp directory inherits the current user's ACL. The
    // random private subdirectory is never selected through frontend IPC.
    let dir = std::env::temp_dir().join(format!("termix-edit-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&dir).map_err(|_| "sftp_local")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "sftp_local")?;
    }
    let extension = doc
        .path
        .extension()
        .and_then(|s| s.to_str())
        .filter(|s| s.len() <= 12 && s.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("txt");
    let local = dir.join(format!("working-copy.{extension}"));
    let subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
    let (bytes, _) = read(
        terminal,
        subsystem.as_ref().ok_or("sftp_failed")?,
        &doc.path,
    )?;
    if digest(&bytes) != doc.hash {
        return Err("editor_conflict".into());
    }
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&local)
        .map_err(|_| "sftp_local")?;
    file.write_all(&bytes).map_err(|_| "sftp_local")?;
    drop(file);
    let mut command = std::process::Command::new(executable);
    command.arg(&local);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    if command.spawn().is_err() {
        let _ = std::fs::remove_file(&local);
        let _ = std::fs::remove_dir(&dir);
        return Err("editor_launch".into());
    }
    doc.local = Some(local);
    Ok(())
}
pub fn reload_external(terminal: &SshTerminal, token: &str) -> Result<String, String> {
    let docs = terminal.documents.0.lock().map_err(|_| "ssh_state")?;
    let file = docs
        .get(token)
        .and_then(|d| d.local.as_ref())
        .ok_or("editor_closed")?;
    let mut bytes = Vec::new();
    std::fs::File::open(file)
        .map_err(|_| "sftp_local")?
        .take(MAX as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "sftp_local")?;
    if bytes.len() > MAX || bytes.contains(&0) {
        return Err("editor_type".into());
    }
    String::from_utf8(bytes).map_err(|_| "editor_encoding".into())
}
