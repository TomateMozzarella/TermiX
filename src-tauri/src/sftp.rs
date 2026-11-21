//! Bounded SFTP work over the already verified/authenticated SSH transport.
//! Local paths come only from owner-bound native pickers, never from IPC.
use crate::ssh::SshTerminal;
use serde::Serialize;
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct Remote {
    pub gate: Mutex<()>,
    pub(crate) monitor_platform: Mutex<Option<crate::monitor::Platform>>,
    pub local_browser: Mutex<Option<crate::local_files::Browser>>,
    pub(crate) subsystem: Mutex<Option<ssh2::Sftp>>,
    pub transfer: Mutex<Option<Arc<Transfer>>>,
}
// Explicit nonblocking close avoids ssh2::File's blocking Drop path while a
// terminal shares the transport. The subsystem is retained until TCP shutdown.
pub(crate) struct Handle<'a> {
    pub(crate) file: ssh2::File,
    pub(crate) terminal: &'a SshTerminal,
}
impl std::ops::Deref for Handle<'_> {
    type Target = ssh2::File;
    fn deref(&self) -> &Self::Target {
        &self.file
    }
}
impl std::ops::DerefMut for Handle<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.file
    }
}
impl Drop for Handle<'_> {
    fn drop(&mut self) {
        let _ = retry(self.terminal, None, || self.file.close());
    }
}
pub struct Transfer {
    cancel: AtomicBool,
    status: Mutex<Progress>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub id: String,
    pub name: String,
    pub direction: String,
    pub bytes: u64,
    pub total: u64,
    pub state: String,
    pub error: Option<String>,
    pub skipped_links: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub directory: bool,
    pub link: bool,
    pub size: Option<u64>,
    pub modified: Option<u64>,
}
#[derive(Serialize)]
pub struct Listing {
    pub path: String,
    pub entries: Vec<Entry>,
}

pub fn path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty()
        || value.len() > 4096
        || value.chars().any(|c| c.is_control())
        || value.contains('\\')
    {
        return Err("sftp_path".into());
    }
    // Remote paths are protocol data, never interpolated into commands.
    Ok(PathBuf::from(value))
}
fn remote_string(value: &Path) -> Result<String, String> {
    value
        .to_str()
        .map(|s| s.replace('\\', "/"))
        .ok_or("sftp_path".into())
}
pub fn retry<T>(
    terminal: &SshTerminal,
    cancelled: Option<&AtomicBool>,
    mut operation: impl FnMut() -> Result<T, ssh2::Error>,
) -> Result<T, String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut pending = false;
    loop {
        if terminal.is_closed()
            || (!pending && cancelled.is_some_and(|c| c.load(Ordering::Acquire)))
        {
            return Err("sftp_cancelled".into());
        }
        match operation() {
            Ok(value) => return Ok(value),
            Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => {
                pending = true;
                if Instant::now() >= deadline {
                    terminal.close();
                    return Err("sftp_timeout".into());
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(e) if e.code() == ssh2::ErrorCode::Session(-16) => return Err("sftp_eof".into()),
            Err(e) if e.code() == ssh2::ErrorCode::SFTP(2) => return Err("sftp_missing".into()),
            Err(e) if e.code() == ssh2::ErrorCode::SFTP(3) => return Err("sftp_permission".into()),
            Err(_) => return Err("sftp_failed".into()),
        }
    }
}
pub fn list(terminal: &SshTerminal, value: &str) -> Result<Listing, String> {
    let _gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
    let requested = path(value)?;
    let mut subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
    if subsystem.is_none() {
        *subsystem = Some(retry(terminal, None, || terminal.ssh_session().sftp())?);
    }
    let sftp = subsystem.as_ref().ok_or("sftp_failed")?;
    let canonical = retry(terminal, None, || sftp.realpath(&requested))?;
    let mut directory = Handle {
        file: retry(terminal, None, || sftp.opendir(&canonical))?,
        terminal,
    };
    let mut entries = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if Instant::now() >= deadline {
            return Err("sftp_timeout".into());
        }
        let entry = retry(terminal, None, || directory.readdir());
        let (name, stat) = match entry {
            Ok(e) => e,
            Err(e) if e == "sftp_eof" => break,
            Err(e) => return Err(e),
        };
        let Some(name) = name.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if name == "." || name == ".." {
            continue;
        }
        if name.contains(['/', '\\']) || name.chars().any(|c| c.is_control()) {
            continue;
        }
        if entries.len() >= 5000 {
            return Err("sftp_limit".into());
        }
        let kind = stat.perm.unwrap_or(0) & 0o170000;
        entries.push(Entry {
            name: name.into(),
            path: remote_string(&canonical.join(name))?,
            directory: kind == 0o040000,
            link: kind == 0o120000,
            size: stat.size,
            modified: stat.mtime,
        });
    }
    entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(Listing {
        path: remote_string(&canonical)?,
        entries,
    })
}
pub fn progress(terminal: &SshTerminal) -> Result<Option<Progress>, String> {
    let task = terminal.remote.transfer.lock().map_err(|_| "ssh_state")?;
    task.as_ref()
        .map(|t| {
            t.status
                .lock()
                .map(|s| s.clone())
                .map_err(|_| "ssh_state".into())
        })
        .transpose()
}
pub fn cancel(terminal: &SshTerminal, id: &str) {
    if let Ok(task) = terminal.remote.transfer.lock() {
        if let Some(t) = task.as_ref() {
            if t.status.lock().is_ok_and(|s| s.id == id) {
                t.cancel.store(true, Ordering::Release);
            }
        }
    }
}
pub fn set_transfer_paused(terminal: &SshTerminal, id: &str, paused: bool) -> Result<(), String> {
    let slot = terminal.remote.transfer.lock().map_err(|_| "ssh_state")?;
    let task = slot.as_ref().ok_or("sftp_missing")?;
    let mut status = task.status.lock().map_err(|_| "ssh_state")?;
    let expected = if paused { "running" } else { "paused" };
    if status.id != id || status.state != expected || task.cancel.load(Ordering::Acquire) {
        return Err("sftp_busy".into());
    }
    status.state = if paused { "paused" } else { "running" }.into();
    Ok(())
}

fn wait_for_transfer(terminal: &SshTerminal, task: &Transfer) -> Result<bool, String> {
    let deadline = Instant::now() + Duration::from_secs(300);
    let mut paused = false;
    loop {
        if terminal.is_closed() || task.cancel.load(Ordering::Acquire) {
            return Err("sftp_cancelled".into());
        }
        if task.status.lock().map_err(|_| "ssh_state")?.state != "paused" {
            return Ok(paused);
        }
        if Instant::now() >= deadline {
            return Err("sftp_pause_expired".into());
        }
        paused = true;
        std::thread::sleep(Duration::from_millis(100));
    }
}

enum LocalTransfer<'a> {
    UploadPath(&'a Path),
    UploadFile(std::fs::File),
    UploadBytes(Vec<u8>),
    Download(&'a Path),
}
pub fn start(
    terminal: Arc<SshTerminal>,
    remote: String,
    local: PathBuf,
    upload: bool,
    overwrite: bool,
) -> Result<String, String> {
    start_inner(terminal, remote, local, upload, overwrite, None)
}
pub fn start_local_upload(
    terminal: Arc<SshTerminal>,
    remote: String,
    file: std::fs::File,
    overwrite: bool,
) -> Result<String, String> {
    start_inner(
        terminal,
        remote,
        PathBuf::new(),
        true,
        overwrite,
        Some(LocalTransfer::UploadFile(file)),
    )
}
pub fn start_dropped_upload(
    terminal: Arc<SshTerminal>,
    remote: String,
    bytes: Vec<u8>,
    overwrite: bool,
) -> Result<String, String> {
    start_inner(
        terminal,
        remote,
        PathBuf::new(),
        true,
        overwrite,
        Some(LocalTransfer::UploadBytes(bytes)),
    )
}
fn start_inner(
    terminal: Arc<SshTerminal>,
    remote: String,
    local: PathBuf,
    upload: bool,
    overwrite: bool,
    source: Option<LocalTransfer<'static>>,
) -> Result<String, String> {
    let remote = path(&remote)?;
    let mut slot = terminal.remote.transfer.lock().map_err(|_| "ssh_state")?;
    if slot.as_ref().is_some_and(|t| {
        t.status
            .lock()
            .is_ok_and(|p| matches!(p.state.as_str(), "running" | "paused"))
    }) {
        return Err("sftp_busy".into());
    }
    // Acquire the gate before creating a task: no orphaned 'running' state.
    let gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
    let id = uuid::Uuid::new_v4().to_string();
    let name = remote
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("sftp_path")?
        .to_owned();
    let task = Arc::new(Transfer {
        cancel: AtomicBool::new(false),
        status: Mutex::new(Progress {
            id: id.clone(),
            name,
            direction: if upload { "upload" } else { "download" }.into(),
            bytes: 0,
            total: 0,
            state: "running".into(),
            error: None,
            skipped_links: 0,
        }),
    });
    *slot = Some(Arc::clone(&task));
    drop(slot);
    drop(gate);
    std::thread::spawn(move || {
        let local = match source {
            Some(source) => source,
            None if upload => LocalTransfer::UploadPath(&local),
            None => LocalTransfer::Download(&local),
        };
        let result = transfer(&terminal, &task, &remote, local, overwrite, false);
        if let Ok(mut p) = task.status.lock() {
            p.state = if result.is_ok() {
                "done"
            } else if result.as_ref().is_err_and(|e| e == "sftp_cancelled") {
                "cancelled"
            } else {
                "failed"
            }
            .into();
            p.error = result.err();
        }
    });
    Ok(id)
}
pub(crate) fn io_retry<T>(
    terminal: &SshTerminal,
    cancel: Option<&AtomicBool>,
    mut op: impl FnMut() -> std::io::Result<T>,
) -> Result<T, String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut pending = false;
    loop {
        if terminal.is_closed() || (!pending && cancel.is_some_and(|c| c.load(Ordering::Acquire))) {
            return Err("sftp_cancelled".into());
        }
        match op() {
            Ok(value) => return Ok(value),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                pending = true;
                if Instant::now() >= deadline {
                    terminal.close();
                    return Err("sftp_timeout".into());
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(_) => return Err("sftp_failed".into()),
        }
    }
}
fn matching_prefix(
    terminal: &SshTerminal,
    task: &Transfer,
    remote: &mut ssh2::File,
    local: &mut dyn Read,
    length: u64,
    buffer: &mut [u8],
) -> Result<bool, String> {
    if length == 0 {
        return Ok(true);
    }
    let mut remaining = length;
    let mut expected = vec![0u8; buffer.len()];
    while remaining != 0 {
        wait_for_transfer(terminal, task)?;
        let limit = remaining.min(buffer.len() as u64) as usize;
        let count = io_retry(terminal, Some(&task.cancel), || {
            remote.read(&mut buffer[..limit])
        })?;
        if count == 0 {
            return Ok(false);
        }
        local
            .read_exact(&mut expected[..count])
            .map_err(|_| "sftp_local")?;
        if buffer[..count] != expected[..count] {
            return Ok(false);
        }
        remaining -= count as u64;
    }
    Ok(true)
}

fn verify_upload_file(
    file: Option<&std::fs::File>,
    original: Option<&std::fs::Metadata>,
) -> Result<(), String> {
    if let (Some(file), Some(original)) = (file, original) {
        let current = file.metadata().map_err(|_| "sftp_local")?;
        if (original.len(), original.modified().ok()) != (current.len(), current.modified().ok()) {
            return Err("sftp_changed".into());
        }
    }
    Ok(())
}

fn transfer(
    terminal: &SshTerminal,
    task: &Transfer,
    remote: &Path,
    local: LocalTransfer<'_>,
    overwrite: bool,
    aggregate: bool,
) -> Result<(), String> {
    let _gate = terminal.remote.gate.lock().map_err(|_| "ssh_state")?;
    let cancelled = Some(&task.cancel);
    let mut subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
    if subsystem.is_none() {
        *subsystem = Some(retry(terminal, cancelled, || {
            terminal.ssh_session().sftp()
        })?);
    }
    let sftp = subsystem.as_ref().ok_or("sftp_failed")?;
    let mut buffer = vec![0u8; 65536];
    if !matches!(local, LocalTransfer::Download(_)) {
        let mut source_file = match local {
            LocalTransfer::UploadFile(file) => (Some(file), None),
            LocalTransfer::UploadBytes(bytes) => (None, Some(std::io::Cursor::new(bytes))),
            LocalTransfer::UploadPath(path) => {
                let metadata = std::fs::symlink_metadata(path).map_err(|_| "sftp_local")?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err("sftp_type".into());
                }
                (
                    Some(std::fs::File::open(path).map_err(|_| "sftp_local")?),
                    None,
                )
            }
            LocalTransfer::Download(_) => unreachable!(),
        };
        let start_bytes = task.status.lock().map_err(|_| "ssh_state")?.bytes;
        let (file, contents) = &mut source_file;
        let original = file
            .as_ref()
            .map(std::fs::File::metadata)
            .transpose()
            .map_err(|_| "sftp_local")?;
        let size = if let Some(metadata) = original.as_ref() {
            if !metadata.is_file() {
                return Err("sftp_type".into());
            }
            metadata.len()
        } else {
            contents.as_ref().ok_or("sftp_local")?.get_ref().len() as u64
        };
        if !aggregate {
            task.status.lock().map_err(|_| "ssh_state")?.total = size;
        }
        let before = match retry(terminal, cancelled, || sftp.lstat(remote)) {
            Ok(stat) => Some(stat),
            Err(e) if e == "sftp_missing" => None,
            Err(e) => return Err(e),
        };
        if let Some(stat) = before.as_ref().filter(|_| !overwrite) {
            // Folder retries may encounter files already delivered by the previous attempt.
            if !aggregate
                || stat.size != Some(size)
                || stat.perm.unwrap_or(0) & 0o170000 != 0o100000
            {
                return Err("sftp_exists".into());
            }
            let file = file.as_mut().ok_or("sftp_local")?;
            let mut existing = Handle {
                file: retry(terminal, cancelled, || sftp.open(remote))?,
                terminal,
            };
            if !matching_prefix(terminal, task, &mut existing, file, size, &mut buffer)? {
                return Err("sftp_exists".into());
            }
            verify_upload_file(Some(file), original.as_ref())?;
            let after = retry(terminal, cancelled, || sftp.lstat(remote))?;
            if (stat.size, stat.mtime, stat.perm) != (after.size, after.mtime, after.perm) {
                return Err("sftp_changed".into());
            }
            task.status.lock().map_err(|_| "ssh_state")?.bytes += size;
            return Ok(());
        }
        if before
            .as_ref()
            .is_some_and(|s| s.perm.unwrap_or(0) & 0o170000 != 0o100000)
        {
            return Err("sftp_type".into());
        }
        // SFTP cannot prove that a prior path still identifies the file we created.
        // Write only through a fresh exclusive handle and never reopen a partial for writing.
        let parent = remote_string(remote.parent().ok_or("sftp_path")?)?;
        let temporary = path(&format!(
            "{}/.termix-upload-{}.part",
            parent.trim_end_matches('/'),
            uuid::Uuid::new_v4()
        ))?;
        let mut destination = Handle {
            file: retry(terminal, cancelled, || {
                sftp.open_mode(
                    &temporary,
                    ssh2::OpenFlags::WRITE | ssh2::OpenFlags::CREATE | ssh2::OpenFlags::EXCLUSIVE,
                    0o600,
                    ssh2::OpenType::File,
                )
            })?,
            terminal,
        };
        let result = (|| -> Result<(), String> {
            let verify_upload = || -> Result<(), String> {
                let now = match retry(terminal, cancelled, || sftp.lstat(remote)) {
                    Ok(stat) => Some(stat),
                    Err(error) if error == "sftp_missing" => None,
                    Err(error) => return Err(error),
                };
                if before.as_ref().map(|s| (s.size, s.mtime, s.perm))
                    != now.as_ref().map(|s| (s.size, s.mtime, s.perm))
                {
                    return Err("sftp_changed".into());
                }
                Ok(())
            };
            loop {
                if wait_for_transfer(terminal, task)? {
                    verify_upload()?;
                    verify_upload_file(file.as_ref(), original.as_ref())?;
                }
                let source: &mut dyn Read = if let Some(file) = file.as_mut() {
                    file
                } else {
                    contents.as_mut().ok_or("sftp_local")?
                };
                let n = source.read(&mut buffer).map_err(|_| "sftp_local")?;
                if n == 0 {
                    break;
                }
                let mut offset = 0;
                while offset < n {
                    let written = io_retry(terminal, Some(&task.cancel), || {
                        destination.write(&buffer[offset..n])
                    })?;
                    if written == 0 {
                        return Err("sftp_failed".into());
                    }
                    offset += written;
                    task.status.lock().map_err(|_| "ssh_state")?.bytes += written as u64;
                }
            }
            if task.status.lock().map_err(|_| "ssh_state")?.bytes - start_bytes != size {
                return Err("sftp_changed".into());
            }
            wait_for_transfer(terminal, task)?;
            verify_upload_file(file.as_ref(), original.as_ref())?;
            retry(terminal, cancelled, || destination.close())?;
            verify_upload()?;
            let flags = if overwrite {
                ssh2::RenameFlags::ATOMIC | ssh2::RenameFlags::OVERWRITE | ssh2::RenameFlags::NATIVE
            } else {
                ssh2::RenameFlags::empty()
            };
            retry(terminal, cancelled, || {
                sftp.rename(&temporary, remote, Some(flags))
            })
        })();
        drop(destination);
        if let Err(error) = result {
            let _ = retry(terminal, None, || sftp.unlink(&temporary));
            return Err(error);
        }
        Ok(())
    } else {
        let LocalTransfer::Download(local) = local else {
            unreachable!()
        };
        let stat = retry(terminal, cancelled, || sftp.lstat(remote))?;
        if stat.perm.unwrap_or(0) & 0o170000 != 0o100000 {
            return Err("sftp_type".into());
        }
        let mut source = Handle {
            file: retry(terminal, cancelled, || sftp.open(remote))?,
            terminal,
        };
        task.status.lock().map_err(|_| "ssh_state")?.total = stat.size.unwrap_or(0);
        let parent = local.parent().ok_or("sftp_local")?;
        let parent = std::fs::canonicalize(parent).map_err(|_| "sftp_local")?;
        let local = parent.join(local.file_name().ok_or("sftp_local")?);
        let before = std::fs::symlink_metadata(&local).ok();
        if before
            .as_ref()
            .is_some_and(|m| !m.is_file() || crate::local_files::is_link(m))
        {
            return Err("sftp_type".into());
        }
        let temporary = download_part_path(&local, remote, &terminal.download_scope)?;
        let mut destination = crate::local_files::open_download_part(&temporary)?;
        let partial_size = destination.metadata().map_err(|_| "sftp_local")?.len();
        let mut verified = partial_size == 0;
        let result = (|| -> Result<(), String> {
            if partial_size > stat.size.unwrap_or(0) {
                return Err("sftp_partial_mismatch".into());
            }
            let verify_source = || -> Result<(), String> {
                let after = retry(terminal, cancelled, || sftp.lstat(remote))?;
                if (stat.size, stat.mtime, stat.perm) != (after.size, after.mtime, after.perm) {
                    return Err("sftp_changed".into());
                }
                Ok(())
            };
            if !matching_prefix(
                terminal,
                task,
                &mut source,
                &mut destination,
                partial_size,
                &mut buffer,
            )? {
                return Err("sftp_partial_mismatch".into());
            }
            verify_source()?;
            verified = true;
            task.status.lock().map_err(|_| "ssh_state")?.bytes = partial_size;
            loop {
                if wait_for_transfer(terminal, task)? {
                    verify_source()?;
                }
                let n = io_retry(terminal, Some(&task.cancel), || source.read(&mut buffer))?;
                if n == 0 {
                    break;
                }
                destination
                    .write_all(&buffer[..n])
                    .map_err(|_| "sftp_local")?;
                task.status.lock().map_err(|_| "ssh_state")?.bytes += n as u64;
            }
            if task.status.lock().map_err(|_| "ssh_state")?.bytes != stat.size.unwrap_or(0) {
                verify_source()?;
                return Err("sftp_failed".into());
            }
            destination.sync_all().map_err(|_| "sftp_local")?;
            wait_for_transfer(terminal, task)?;
            verify_source()?;
            if task.cancel.load(Ordering::Acquire) {
                return Err("sftp_cancelled".into());
            }
            if std::fs::canonicalize(&parent).map_err(|_| "sftp_local")? != parent {
                return Err("sftp_changed".into());
            }
            let now = std::fs::symlink_metadata(&local).ok();
            if before.as_ref().map(|m| (m.len(), m.modified().ok()))
                != now.as_ref().map(|m| (m.len(), m.modified().ok()))
                || now
                    .as_ref()
                    .is_some_and(|m| !m.is_file() || crate::local_files::is_link(m))
            {
                return Err("sftp_changed".into());
            }
            Ok(())
        })();
        drop(destination);
        if let Err(error) = result {
            let cancelled_by_user = task.cancel.load(Ordering::Acquire);
            let keep = !cancelled_by_user
                && (terminal.is_closed()
                    || matches!(error.as_str(), "sftp_failed" | "sftp_timeout"));
            if verified && !keep {
                let _ = std::fs::remove_file(&temporary);
            }
            return Err(if keep {
                "sftp_partial_saved".into()
            } else {
                error
            });
        }
        crate::atomic::replace_file(&temporary, &local).map_err(|_| "sftp_local".to_owned())
    }
}

pub(crate) fn download_part_path(
    local: &Path,
    remote: &Path,
    scope: &str,
) -> Result<PathBuf, String> {
    use sha2::{Digest, Sha256};
    let name = local
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("sftp_local")?;
    let mut digest = Sha256::new();
    digest.update(scope.as_bytes());
    digest.update([0]);
    digest.update(remote_string(remote)?.as_bytes());
    digest.update([0]);
    digest.update(name.as_bytes());
    Ok(local.with_file_name(format!(".termix-{:x}.part", digest.finalize())))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_ambiguous_remote_paths() {
        for p in ["", "a\\b", "a\n", "a\0"] {
            assert!(path(p).is_err());
        }
        assert!(path("/home/user/ö space.txt").is_ok());
    }
}
pub fn file_action(terminal: &SshTerminal, value: &str, action: &str) -> Result<(), String> {
    let target = path(value)?;
    if target.parent().is_none() {
        return Err("sftp_path".into());
    }
    let _gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
    let subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
    let sftp = subsystem.as_ref().ok_or("sftp_failed")?;
    match action {
        "create" => {
            let handle = Handle {
                file: retry(terminal, None, || {
                    sftp.open_mode(
                        &target,
                        ssh2::OpenFlags::WRITE
                            | ssh2::OpenFlags::CREATE
                            | ssh2::OpenFlags::EXCLUSIVE,
                        0o600,
                        ssh2::OpenType::File,
                    )
                })?,
                terminal,
            };
            drop(handle);
            Ok(())
        }
        "delete" => {
            let stat = retry(terminal, None, || sftp.lstat(&target))?;
            match stat.perm.unwrap_or(0) & 0o170000 {
                0o100000 => retry(terminal, None, || sftp.unlink(&target)),
                0o040000 => retry(terminal, None, || sftp.rmdir(&target)),
                _ => Err("sftp_type".into()),
            }
        }
        _ => Err("sftp_path".into()),
    }
}
struct Planned {
    relative: PathBuf,
    directory: bool,
    size: u64,
    modified: Option<std::time::SystemTime>,
}
fn folder_plan(root: &Path, cancel: &AtomicBool) -> Result<(Vec<Planned>, u64, u32), String> {
    let meta = std::fs::symlink_metadata(root).map_err(|_| "sftp_local")?;
    if !meta.is_dir() || crate::local_files::is_link(&meta) {
        return Err("sftp_type".into());
    }
    let mut plan = vec![Planned {
        relative: PathBuf::new(),
        directory: true,
        size: 0,
        modified: None,
    }];
    let mut stack = vec![(PathBuf::new(), 0usize)];
    let (mut total, mut skipped, mut visited) = (0u64, 0u32, 0usize);
    while let Some((relative, depth)) = stack.pop() {
        if depth > 32 {
            return Err("sftp_too_many".into());
        }
        let local_directory = root.join(&relative);
        if !crate::local_files::safe_directory(&local_directory)
            || std::fs::canonicalize(&local_directory).map_err(|_| "sftp_local")? != local_directory
        {
            return Err("sftp_changed".into());
        }
        for entry in std::fs::read_dir(&local_directory).map_err(|_| "sftp_local")? {
            if cancel.load(Ordering::Acquire) {
                return Err("sftp_cancelled".into());
            }
            visited += 1;
            if visited > 10000 {
                return Err("sftp_too_many".into());
            }
            let entry = entry.map_err(|_| "sftp_local")?;
            let sub = relative.join(entry.file_name());
            path(&remote_string(&sub)?)?;
            let meta = std::fs::symlink_metadata(entry.path()).map_err(|_| "sftp_local")?;
            if crate::local_files::is_link(&meta) || (!meta.is_dir() && !meta.is_file()) {
                skipped += 1;
                continue;
            }
            if meta.is_dir() {
                stack.push((sub.clone(), depth + 1));
            } else {
                total = total.checked_add(meta.len()).ok_or("sftp_too_many")?;
            }
            plan.push(Planned {
                relative: sub,
                directory: meta.is_dir(),
                size: meta.len(),
                modified: meta.modified().ok(),
            });
        }
    }
    Ok((plan, total, skipped))
}
fn folder_transfer(
    terminal: &SshTerminal,
    task: &Transfer,
    destination: &Path,
    local: &Path,
    overwrite: bool,
    strict_path: bool,
) -> Result<(), String> {
    if !crate::local_files::safe_directory(local) {
        return Err("sftp_type".into());
    }
    let canonical = std::fs::canonicalize(local).map_err(|_| "sftp_local")?;
    if strict_path && canonical != local {
        return Err("sftp_changed".into());
    }
    let (plan, total, skipped) = folder_plan(&canonical, &task.cancel)?;
    {
        let mut p = task.status.lock().map_err(|_| "ssh_state")?;
        p.total = total;
        p.skipped_links = skipped;
    }
    for item in plan {
        wait_for_transfer(terminal, task)?;
        let remote = destination.join(&item.relative);
        {
            let _gate = terminal.remote.gate.lock().map_err(|_| "ssh_state")?;
            let mut subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
            if subsystem.is_none() {
                *subsystem = Some(retry(terminal, Some(&task.cancel), || {
                    terminal.ssh_session().sftp()
                })?);
            }
            let sftp = subsystem.as_ref().ok_or("sftp_failed")?;
            // Every parent must remain a directory, never a symlink.
            let check = remote.parent();
            if let Some(parent) = check {
                for component in parent.ancestors() {
                    if component.as_os_str().is_empty() {
                        continue;
                    }
                    let stat = retry(terminal, Some(&task.cancel), || sftp.lstat(component))?;
                    if stat.perm.unwrap_or(0) & 0o170000 != 0o040000 {
                        return Err("sftp_type".into());
                    }
                }
            }
            if item.directory {
                match retry(terminal, Some(&task.cancel), || sftp.lstat(&remote)) {
                    Ok(stat) if stat.perm.unwrap_or(0) & 0o170000 == 0o040000 => {}
                    Ok(_) => return Err("sftp_type".into()),
                    Err(e) if e == "sftp_missing" => {
                        retry(terminal, Some(&task.cancel), || sftp.mkdir(&remote, 0o700))?;
                    }
                    Err(e) => return Err(e),
                }
            }
        }
        if !item.directory {
            let source = crate::local_files::open_verified_file(&canonical.join(&item.relative))?;
            let meta = source.metadata().map_err(|_| "sftp_local")?;
            if meta.len() != item.size || meta.modified().ok() != item.modified {
                return Err("sftp_changed".into());
            }
            task.status.lock().map_err(|_| "ssh_state")?.name = remote_string(&item.relative)?;
            transfer(
                terminal,
                task,
                &remote,
                LocalTransfer::UploadFile(source),
                overwrite,
                true,
            )?;
        }
    }
    if task.status.lock().map_err(|_| "ssh_state")?.bytes != total {
        return Err("sftp_changed".into());
    }
    Ok(())
}
pub fn start_folder(
    terminal: Arc<SshTerminal>,
    directory: String,
    local: PathBuf,
    overwrite: bool,
) -> Result<String, String> {
    start_folder_inner(terminal, directory, local, overwrite, false)
}

pub fn start_local_folder(
    terminal: Arc<SshTerminal>,
    directory: String,
    local: PathBuf,
    overwrite: bool,
) -> Result<String, String> {
    start_folder_inner(terminal, directory, local, overwrite, true)
}

fn start_folder_inner(
    terminal: Arc<SshTerminal>,
    directory: String,
    local: PathBuf,
    overwrite: bool,
    strict_path: bool,
) -> Result<String, String> {
    let name = local
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("sftp_path")?;
    let remote = path(&directory)?.join(name);
    path(&remote_string(&remote)?)?;
    let mut slot = terminal.remote.transfer.lock().map_err(|_| "ssh_state")?;
    if slot.as_ref().is_some_and(|t| {
        t.status
            .lock()
            .is_ok_and(|p| matches!(p.state.as_str(), "running" | "paused"))
    }) {
        return Err("sftp_busy".into());
    }
    let gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
    let id = uuid::Uuid::new_v4().to_string();
    let task = Arc::new(Transfer {
        cancel: AtomicBool::new(false),
        status: Mutex::new(Progress {
            id: id.clone(),
            name: name.into(),
            direction: "upload".into(),
            bytes: 0,
            total: 0,
            state: "running".into(),
            error: None,
            skipped_links: 0,
        }),
    });
    *slot = Some(task.clone());
    drop(slot);
    drop(gate);
    std::thread::spawn(move || {
        let result = folder_transfer(&terminal, &task, &remote, &local, overwrite, strict_path);
        if let Ok(mut status) = task.status.lock() {
            status.state = if result.is_ok() {
                "done"
            } else if result.as_ref().is_err_and(|e| e == "sftp_cancelled") {
                "cancelled"
            } else {
                "failed"
            }
            .into();
            status.error = result.err();
        }
    });
    Ok(id)
}
#[cfg(test)]
mod folder_tests {
    #[test]
    fn plans_nested_files_and_empty_directories_without_reading_file_contents() {
        let root = std::env::temp_dir().join(format!("termix-folder-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("nested/empty")).unwrap();
        std::fs::write(root.join("nested/file.txt"), b"abc").unwrap();
        let (plan, total, skipped) = super::folder_plan(
            &std::fs::canonicalize(&root).unwrap(),
            &std::sync::atomic::AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(total, 3);
        assert_eq!(skipped, 0);
        assert_eq!(plan.len(), 4);
        assert!(super::folder_plan(&root, &std::sync::atomic::AtomicBool::new(true)).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
