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
    subsystem: Mutex<Option<ssh2::Sftp>>,
    pub transfer: Mutex<Option<Arc<Transfer>>>,
}
// Explicit nonblocking close avoids ssh2::File's blocking Drop path while a
// terminal shares the transport. The subsystem is retained until TCP shutdown.
struct Handle<'a> {
    file: ssh2::File,
    terminal: &'a SshTerminal,
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
pub fn start(
    terminal: Arc<SshTerminal>,
    remote: String,
    local: PathBuf,
    upload: bool,
    overwrite: bool,
) -> Result<String, String> {
    let remote = path(&remote)?;
    let mut slot = terminal.remote.transfer.lock().map_err(|_| "ssh_state")?;
    if slot
        .as_ref()
        .is_some_and(|t| t.status.lock().is_ok_and(|p| p.state == "running"))
    {
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
        }),
    });
    *slot = Some(Arc::clone(&task));
    drop(slot);
    drop(gate);
    std::thread::spawn(move || {
        let result = transfer(&terminal, &task, &remote, &local, upload, overwrite);
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
fn io_retry<T>(
    terminal: &SshTerminal,
    task: &Transfer,
    mut op: impl FnMut() -> std::io::Result<T>,
) -> Result<T, String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut pending = false;
    loop {
        if terminal.is_closed() || (!pending && task.cancel.load(Ordering::Acquire)) {
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
fn transfer(
    terminal: &SshTerminal,
    task: &Transfer,
    remote: &Path,
    local: &Path,
    upload: bool,
    overwrite: bool,
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
    if upload {
        let mut source = std::fs::File::open(local).map_err(|_| "sftp_local")?;
        let original = source.metadata().map_err(|_| "sftp_local")?;
        let size = original.len();
        if !source.metadata().map_err(|_| "sftp_local")?.is_file() {
            return Err("sftp_local".into());
        }
        task.status.lock().map_err(|_| "ssh_state")?.total = size;
        let before = match retry(terminal, cancelled, || sftp.lstat(remote)) {
            Ok(stat) => Some(stat),
            Err(e) if e == "sftp_missing" => None,
            Err(e) => return Err(e),
        };
        if before.is_some() && !overwrite {
            return Err("sftp_exists".into());
        }
        if before
            .as_ref()
            .is_some_and(|s| s.perm.unwrap_or(0) & 0o170000 != 0o100000)
        {
            return Err("sftp_type".into());
        }
        let temporary = path(&format!(
            "{}/.termix-{}.part",
            remote_string(remote.parent().ok_or("sftp_path")?)?,
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
        let result = (|| {
            loop {
                let n = source.read(&mut buffer).map_err(|_| "sftp_local")?;
                if n == 0 {
                    break;
                }
                let mut offset = 0;
                while offset < n {
                    let written =
                        io_retry(terminal, task, || destination.write(&buffer[offset..n]))?;
                    if written == 0 {
                        return Err("sftp_failed".into());
                    }
                    offset += written;
                    task.status.lock().map_err(|_| "ssh_state")?.bytes += written as u64;
                }
            }
            let current = source.metadata().map_err(|_| "sftp_local")?;
            if task.status.lock().map_err(|_| "ssh_state")?.bytes != size
                || (original.len(), original.modified().ok())
                    != (current.len(), current.modified().ok())
            {
                return Err("sftp_changed".into());
            }
            retry(terminal, cancelled, || destination.close())?;
            let now = match retry(terminal, cancelled, || sftp.lstat(remote)) {
                Ok(s) => Some(s),
                Err(e) if e == "sftp_missing" => None,
                Err(e) => return Err(e),
            };
            if before.as_ref().map(|s| (s.size, s.mtime, s.perm))
                != now.as_ref().map(|s| (s.size, s.mtime, s.perm))
            {
                return Err("sftp_changed".into());
            }
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
        if result.is_err() {
            let _ = retry(terminal, None, || sftp.unlink(&temporary));
        }
        result
    } else {
        let stat = retry(terminal, cancelled, || sftp.lstat(remote))?;
        if stat.perm.unwrap_or(0) & 0o170000 != 0o100000 {
            return Err("sftp_type".into());
        }
        let mut source = Handle {
            file: retry(terminal, cancelled, || sftp.open(remote))?,
            terminal,
        };
        task.status.lock().map_err(|_| "ssh_state")?.total = stat.size.unwrap_or(0);
        let before = std::fs::symlink_metadata(local).ok();
        if before
            .as_ref()
            .is_some_and(|m| !m.is_file() || m.file_type().is_symlink())
        {
            return Err("sftp_type".into());
        }
        let temporary = local.with_file_name(format!(".termix-{}.part", uuid::Uuid::new_v4()));
        let mut destination = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "sftp_local")?;
        let result = (|| {
            loop {
                let n = io_retry(terminal, task, || source.read(&mut buffer))?;
                if n == 0 {
                    break;
                }
                destination
                    .write_all(&buffer[..n])
                    .map_err(|_| "sftp_local")?;
                task.status.lock().map_err(|_| "ssh_state")?.bytes += n as u64;
            }
            if task.status.lock().map_err(|_| "ssh_state")?.bytes != stat.size.unwrap_or(0) {
                return Err("sftp_changed".into());
            }
            destination.sync_all().map_err(|_| "sftp_local")?;
            let after = retry(terminal, cancelled, || sftp.lstat(remote))?;
            if (stat.size, stat.mtime) != (after.size, after.mtime) {
                return Err("sftp_changed".into());
            }
            if task.cancel.load(Ordering::Acquire) {
                return Err("sftp_cancelled".into());
            }
            drop(destination);
            let now = std::fs::symlink_metadata(local).ok();
            if before.as_ref().map(|m| (m.len(), m.modified().ok()))
                != now.as_ref().map(|m| (m.len(), m.modified().ok()))
                || now
                    .as_ref()
                    .is_some_and(|m| !m.is_file() || m.file_type().is_symlink())
            {
                return Err("sftp_changed".into());
            }
            // User explicitly confirmed the local destination in Save As. Use the
            // same atomic platform replacement primitive as catalog persistence.
            crate::atomic::replace_file(&temporary, local).map_err(|_| "sftp_local")
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&temporary);
        }
        result
    }
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
