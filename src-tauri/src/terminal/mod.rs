mod job;

use job::ProcessJob;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, TrySendError},
        Arc, Mutex,
    },
    time::Duration,
};

const MAX_TERMINALS: usize = 16;
const MAX_INPUT: usize = 64 * 1024;

#[derive(Clone, Serialize)]
pub struct ShellProfile {
    pub id: &'static str,
    pub name: &'static str,
}

pub fn profiles() -> Vec<ShellProfile> {
    #[cfg(windows)]
    {
        vec![
            ShellProfile {
                id: "powershell",
                name: "Windows PowerShell",
            },
            ShellProfile {
                id: "cmd",
                name: "CMD",
            },
        ]
    }
    #[cfg(not(windows))]
    {
        vec![ShellProfile {
            id: "sh",
            name: "Shell",
        }]
    }
}

fn shell_command(profile: &str) -> Result<CommandBuilder, String> {
    #[cfg(windows)]
    {
        let root = std::env::var_os("SystemRoot").ok_or("SystemRoot unavailable")?;
        let system = std::path::PathBuf::from(root).join("System32");
        let mut cmd = match profile {
            "powershell" => {
                let mut cmd =
                    CommandBuilder::new(system.join("WindowsPowerShell/v1.0/powershell.exe"));
                cmd.args(["-NoLogo", "-NoProfile", "-NoExit"]);
                cmd
            }
            "cmd" => {
                let mut cmd = CommandBuilder::new(system.join("cmd.exe"));
                cmd.arg("/D");
                cmd
            }
            _ => return Err("Unknown local shell profile".into()),
        };
        cmd.env("TERM", "xterm-256color");
        Ok(cmd)
    }
    #[cfg(not(windows))]
    {
        if profile != "sh" {
            return Err("Unknown local shell profile".into());
        }
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.arg("-i");
        cmd.env("TERM", "xterm-256color");
        Ok(cmd)
    }
}

fn size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if !(2..=500).contains(&cols) || !(1..=300).contains(&rows) {
        return Err("Terminal dimensions out of range".into());
    }
    Ok(PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    })
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Output {
    Data { bytes: Vec<u8> },
    Pending,
    Exit { code: Option<u32> },
    Error { message: String },
}

pub struct TerminalSession {
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    job: Mutex<Option<ProcessJob>>,
    output: Mutex<Receiver<Output>>,
    stopped: AtomicBool,
    exit: Mutex<Option<Option<u32>>>,
}

impl TerminalSession {
    fn spawn(profile: &str, cols: u16, rows: u16) -> Result<Arc<Self>, String> {
        let command = shell_command(profile)?;
        let pair = native_pty_system()
            .openpty(size(cols, rows)?)
            .map_err(|_| "Cannot create PTY")?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|_| "Cannot open PTY output")?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|_| "Cannot open PTY input")?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|_| "Cannot launch local shell")?;
        drop(pair.slave);
        let job = match ProcessJob::attach(child.as_ref()) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        // At most 16 * 8 KiB queued per terminal. The frontend pulls the next
        // chunk only after xterm's parser has consumed the previous one.
        let (tx, rx) = mpsc::sync_channel(16);
        let session = Arc::new(Self {
            master: Mutex::new(Some(pair.master)),
            writer: Mutex::new(Some(writer)),
            killer: Mutex::new(child.clone_killer()),
            job: Mutex::new(Some(job)),
            output: Mutex::new(rx),
            stopped: AtomicBool::new(false),
            exit: Mutex::new(None),
        });
        let read_session = Arc::clone(&session);
        std::thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                let message = match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => Output::Data {
                        bytes: buffer[..n].to_vec(),
                    },
                    Err(e)
                        if matches!(
                            e.kind(),
                            std::io::ErrorKind::BrokenPipe | std::io::ErrorKind::UnexpectedEof
                        ) =>
                    {
                        break
                    }
                    // Unix PTYs may report EIO at normal shell exit.
                    #[cfg(unix)]
                    Err(e) if e.raw_os_error() == Some(5) => break,
                    Err(_) => {
                        let _ = tx.try_send(Output::Error {
                            message: "PTY output closed".into(),
                        });
                        break;
                    }
                };
                let mut pending = message;
                while !read_session.stopped.load(Ordering::Acquire) {
                    match tx.try_send(pending) {
                        Ok(()) => break,
                        Err(TrySendError::Full(value)) => {
                            pending = value;
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        Err(TrySendError::Disconnected(_)) => return,
                    }
                }
                // Keep draining during shutdown: ClosePseudoConsole can wait
                // for its output pipe and must not deadlock against this reader.
            }
        });
        let wait_session = Arc::clone(&session);
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|s| s.exit_code());
            *wait_session.exit.lock().unwrap_or_else(|e| e.into_inner()) = Some(code);
            wait_session.release_handles();
        });
        Ok(session)
    }

    fn release_handles(&self) {
        self.job.lock().unwrap_or_else(|e| e.into_inner()).take();
        self.writer.lock().unwrap_or_else(|e| e.into_inner()).take();
        self.master.lock().unwrap_or_else(|e| e.into_inner()).take();
    }

    pub fn close(&self) {
        self.stopped.store(true, Ordering::Release);
        let _ = self.killer.lock().unwrap_or_else(|e| e.into_inner()).kill();
        self.release_handles();
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        if data.len() > MAX_INPUT {
            return Err("Terminal input too large".into());
        }
        let mut writer = self.writer.lock().map_err(|_| "PTY input unavailable")?;
        let writer = writer.as_mut().ok_or("Terminal has exited")?;
        writer
            .write_all(data)
            .and_then(|_| writer.flush())
            .map_err(|_| "Cannot write PTY input".into())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let dimensions = size(cols, rows)?;
        self.master
            .lock()
            .map_err(|_| "PTY unavailable")?
            .as_ref()
            .ok_or("Terminal has exited")?
            .resize(dimensions)
            .map_err(|_| "Cannot resize PTY".into())
    }

    pub fn read(&self) -> Result<Output, String> {
        match self
            .output
            .lock()
            .map_err(|_| "PTY output unavailable")?
            .recv_timeout(Duration::from_millis(100))
        {
            Ok(value) => Ok(value),
            Err(mpsc::RecvTimeoutError::Timeout) => Ok(Output::Pending),
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                match *self.exit.lock().map_err(|_| "PTY status unavailable")? {
                    Some(code) => Ok(Output::Exit { code }),
                    None => Ok(Output::Pending),
                }
            }
        }
    }
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

impl TerminalManager {
    pub fn open(&self, profile: &str, cols: u16, rows: u16) -> Result<String, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Terminal state unavailable")?;
        if sessions.len() >= MAX_TERMINALS {
            return Err("Maximum of 16 local terminals reached".into());
        }
        let session = TerminalSession::spawn(profile, cols, rows)?;
        let id = uuid::Uuid::new_v4().to_string();
        sessions.insert(id.clone(), session);
        Ok(id)
    }

    pub fn get(&self, id: &str) -> Result<Arc<TerminalSession>, String> {
        self.sessions
            .lock()
            .map_err(|_| "Terminal state unavailable")?
            .get(id)
            .cloned()
            .ok_or("Terminal not found".into())
    }

    pub fn close(&self, id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "Terminal state unavailable")?
            .remove(id);
        if let Some(session) = session {
            session.close();
        }
        Ok(()) // idempotent for React cleanup and natural shell exit
    }

    pub fn close_all(&self) {
        let sessions =
            std::mem::take(&mut *self.sessions.lock().unwrap_or_else(|e| e.into_inner()));
        for session in sessions.into_values() {
            session.close();
        }
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        self.close_all();
    }
}

#[cfg(test)]
mod tests;

#[cfg(all(test, windows))]
mod cleanup_tests;
