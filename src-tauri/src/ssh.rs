//! SSH uses libssh2 exclusively in Rust. Host verification precedes all
//! authentication. No remote command is assembled or passed to a local shell.
use crate::terminal::Output;
use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    net::{Shutdown, TcpStream, ToSocketAddrs},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use zeroize::Zeroizing;

const LIMIT: usize = 8;
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Pin {
    key: String,
    algorithm: String,
    fingerprint: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub ticket: String,
    pub host: String,
    pub port: u16,
    pub algorithm: String,
    pub fingerprint: String,
    pub previous_fingerprint: Option<String>,
    pub status: String,
}

struct Pending {
    session: ssh2::Session,
    socket: TcpStream,
    host: String,
    port: u16,
    pin: Pin,
    previous: Option<Pin>,
    expires: Instant,
}

// Deliberately no Debug/Serialize: auth material must not appear in errors/logs.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Auth {
    pub username: String,
    pub method: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub key_path: String,
    #[serde(default)]
    pub passphrase: String,
    #[serde(default)]
    pub save_password: bool,
}
impl Drop for Auth {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.password.zeroize();
        self.passphrase.zeroize();
    }
}

pub struct SshManager {
    pins_path: PathBuf,
    pending: Mutex<HashMap<String, Pending>>,
    sessions: Mutex<HashMap<String, Arc<SshTerminal>>>,
    pins_lock: Mutex<()>,
    connecting: AtomicUsize,
    resolvers: Arc<AtomicUsize>,
}

struct Slot<'a>(&'a AtomicUsize);
impl Drop for Slot<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}
fn claim(count: &AtomicUsize) -> Result<Slot<'_>, String> {
    count
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
            (n < LIMIT).then_some(n + 1)
        })
        .map_err(|_| "ssh_limit")?;
    Ok(Slot(count))
}

fn endpoint(host: &str, port: u16) -> String {
    format!("[{host}]:{port}")
}
pub fn validate_endpoint(host: &str, port: u16) -> Result<String, String> {
    if host.chars().any(|c| c.is_control()) {
        return Err("invalid_host".into());
    }
    let host = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_ascii_lowercase();
    if host.is_empty()
        || host.len() > 253
        || port == 0
        || host.starts_with('-')
        || host
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && !".-:_".contains(c))
    {
        return Err("invalid_host".into());
    }
    Ok(host)
}
fn validate_username(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 256 || value.chars().any(|c| c.is_control()) {
        Err("invalid_username".into())
    } else {
        Ok(())
    }
}
fn size(cols: u16, rows: u16) -> Result<(), String> {
    if (2..=1000).contains(&cols) && (1..=500).contains(&rows) {
        Ok(())
    } else {
        Err("invalid_size".into())
    }
}

impl SshManager {
    pub fn new(path: PathBuf) -> Self {
        Self {
            pins_path: path,
            pending: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
            pins_lock: Mutex::new(()),
            connecting: AtomicUsize::new(0),
            resolvers: Arc::new(AtomicUsize::new(0)),
        }
    }
    fn pins(&self) -> Result<HashMap<String, Pin>, String> {
        match std::fs::read(&self.pins_path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "known_hosts_invalid".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
            Err(_) => Err("known_hosts_failed".into()),
        }
    }
    pub fn probe(&self, host: &str, port: u16) -> Result<Probe, String> {
        let _slot = claim(&self.connecting)?;
        let host = validate_endpoint(host, port)?;
        {
            let mut p = self.pending.lock().map_err(|_| "ssh_state")?;
            p.retain(|_, v| {
                let keep = v.expires > Instant::now();
                if !keep {
                    let _ = v.socket.shutdown(Shutdown::Both);
                }
                keep
            });
            if p.len() >= LIMIT {
                return Err("ssh_limit".into());
            }
        }
        // DNS lookup is kept off the UI thread and bounded separately. The
        // resolver worker owns no credentials or sockets if it outlives timeout.
        let name = host.clone();
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        self.resolvers
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                (n < LIMIT).then_some(n + 1)
            })
            .map_err(|_| "ssh_limit")?;
        let resolvers = Arc::clone(&self.resolvers);
        std::thread::spawn(move || {
            let _slot = Slot(&resolvers);
            let result = (name.as_str(), port)
                .to_socket_addrs()
                .map(|a| a.take(8).collect::<Vec<_>>());
            let _ = tx.send(result);
        });
        let addresses = rx
            .recv_timeout(TIMEOUT)
            .map_err(|_| "ssh_timeout")?
            .map_err(|_| "ssh_resolve")?;
        let deadline = Instant::now() + TIMEOUT;
        let mut connected = None;
        for address in addresses {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            if let Ok(socket) = TcpStream::connect_timeout(&address, remaining) {
                connected = Some(socket);
                break;
            }
        }
        let socket = connected.ok_or("ssh_connect_failed")?;
        socket
            .set_read_timeout(Some(TIMEOUT))
            .map_err(|_| "ssh_connect_failed")?;
        socket
            .set_write_timeout(Some(TIMEOUT))
            .map_err(|_| "ssh_connect_failed")?;
        let mut session = ssh2::Session::new().map_err(|_| "ssh_failed")?;
        use ssh2::MethodType;
        for (method, algorithms) in [
            (MethodType::Kex, "curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha256"),
            (MethodType::HostKey, "ssh-ed25519,ecdsa-sha2-nistp256,rsa-sha2-512,rsa-sha2-256"),
            (MethodType::SignAlgo, "ssh-ed25519,ecdsa-sha2-nistp256,rsa-sha2-512,rsa-sha2-256"),
            (MethodType::CryptCs, "chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes128-ctr"),
            (MethodType::CryptSc, "chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes128-ctr"),
            (MethodType::MacCs, "hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256"),
            (MethodType::MacSc, "hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256"),
        ] { session.method_pref(method, algorithms).map_err(|_| "ssh_handshake_failed")?; }
        session.set_timeout(10000);
        session.set_tcp_stream(socket.try_clone().map_err(|_| "ssh_failed")?);
        session.handshake().map_err(|_| "ssh_handshake_failed")?;
        let (key, algorithm) = session.host_key().ok_or("ssh_host_key_missing")?;
        let pin = Pin {
            key: STANDARD_NO_PAD.encode(key),
            algorithm: format!("{algorithm:?}"),
            fingerprint: format!("SHA256:{}", STANDARD_NO_PAD.encode(Sha256::digest(key))),
        };
        let previous = {
            let _lock = self.pins_lock.lock().map_err(|_| "ssh_state")?;
            self.pins()?.get(&endpoint(&host, port)).cloned()
        };
        let status = match &previous {
            None => "unknown",
            Some(old) if *old == pin => "known",
            _ => "changed",
        };
        let ticket = uuid::Uuid::new_v4().to_string();
        let result = Probe {
            ticket: ticket.clone(),
            host: host.clone(),
            port,
            algorithm: pin.algorithm.clone(),
            fingerprint: pin.fingerprint.clone(),
            previous_fingerprint: previous.as_ref().map(|p| p.fingerprint.clone()),
            status: status.into(),
        };
        let mut pending = self.pending.lock().map_err(|_| "ssh_state")?;
        if pending.len() >= LIMIT {
            return Err("ssh_limit".into());
        }
        pending.insert(
            ticket,
            Pending {
                session,
                socket,
                host,
                port,
                pin,
                previous,
                expires: Instant::now() + Duration::from_secs(60),
            },
        );
        Ok(result)
    }
    pub fn cancel(&self, ticket: &str) {
        if let Ok(mut p) = self.pending.lock() {
            if let Some(v) = p.remove(ticket) {
                let _ = v.socket.shutdown(Shutdown::Both);
            }
        }
    }
    pub fn open(
        &self,
        ticket: &str,
        decision: &str,
        confirmation: &str,
        auth: Auth,
        cols: u16,
        rows: u16,
    ) -> Result<String, String> {
        let _slot = claim(&self.connecting)?;
        if auth.save_password && auth.method != "password" {
            return Err("vault_failed".into());
        }
        size(cols, rows)?;
        validate_username(&auth.username)?;
        if auth.password.len() > 4096 || auth.passphrase.len() > 4096 || auth.key_path.len() > 4096
        {
            return Err("ssh_auth_failed".into());
        }
        let pending = self
            .pending
            .lock()
            .map_err(|_| "ssh_state")?
            .remove(ticket)
            .ok_or("ssh_ticket_expired")?;
        if pending.expires <= Instant::now() {
            return Err("ssh_ticket_expired".into());
        }
        {
            // Verify the persisted decision has not changed since this probe.
            let _lock = self.pins_lock.lock().map_err(|_| "ssh_state")?;
            let mut pins = self.pins()?;
            if pins.get(&endpoint(&pending.host, pending.port)) != pending.previous.as_ref() {
                return Err("ssh_recheck_host".into());
            }
            let known = pending.previous.as_ref() == Some(&pending.pin);
            let allowed = if known {
                decision == "known"
            } else if pending.previous.is_none() {
                decision == "trust"
            } else {
                decision == "replace" && confirmation == pending.host
            };
            if !allowed {
                return Err("ssh_host_not_approved".into());
            }
            if !known {
                pins.insert(endpoint(&pending.host, pending.port), pending.pin.clone());
                let bytes = serde_json::to_vec_pretty(&pins).map_err(|_| "known_hosts_failed")?;
                crate::atomic::write(&self.pins_path, &bytes).map_err(|_| "known_hosts_failed")?;
            }
        }
        let session = pending.session;
        let password = if auth.method == "stored" {
            crate::vault::read(&pending.host, pending.port, &auth.username)?
        } else {
            Zeroizing::new(auth.password.clone())
        };
        match auth.method.as_str() {
            "password" | "stored" => session
                .userauth_password(&auth.username, &password)
                .map_err(|_| "ssh_auth_failed")?,
            "key" => {
                let path = PathBuf::from(&auth.key_path);
                if !path.is_absolute() || !path.is_file() {
                    return Err("ssh_key_invalid".into());
                }
                let pass = if auth.passphrase.is_empty() {
                    None
                } else {
                    Some(auth.passphrase.as_str())
                };
                session
                    .userauth_pubkey_file(&auth.username, None, &path, pass)
                    .map_err(|_| "ssh_auth_failed")?;
            }
            "agent" => session
                .userauth_agent(&auth.username)
                .map_err(|_| "ssh_agent_failed")?,
            _ => return Err("ssh_auth_failed".into()),
        }
        if !session.authenticated() {
            return Err("ssh_auth_failed".into());
        }
        let mut channel = session
            .channel_session()
            .map_err(|_| "ssh_channel_failed")?;
        channel
            .request_pty(
                "xterm-256color",
                None,
                Some((cols as u32, rows as u32, 0, 0)),
            )
            .map_err(|_| "ssh_channel_failed")?;
        channel
            .handle_extended_data(ssh2::ExtendedData::Merge)
            .map_err(|_| "ssh_channel_failed")?;
        channel.shell().map_err(|_| "ssh_channel_failed")?;
        if auth.save_password {
            if auth.method != "password" {
                return Err("vault_failed".into());
            }
            crate::vault::save(&pending.host, pending.port, &auth.username, &password)?;
        }
        session.set_keepalive(true, 15);
        session.set_blocking(false);
        let terminal = Arc::new(SshTerminal {
            socket: pending.socket,
            session,
            io: Mutex::new(SshIo {
                channel,
                input: VecDeque::new(),
                resize: None,
                exited: None,
            }),
            closed: AtomicBool::new(false),
        });
        let mut sessions = self.sessions.lock().map_err(|_| "ssh_state")?;
        if sessions.len() >= LIMIT {
            return Err("ssh_limit".into());
        }
        let id = format!("ssh-{}", uuid::Uuid::new_v4());
        sessions.insert(id.clone(), terminal);
        Ok(id)
    }
    pub fn get(&self, id: &str) -> Result<Arc<SshTerminal>, String> {
        self.sessions
            .lock()
            .map_err(|_| "ssh_state")?
            .get(id)
            .cloned()
            .ok_or("ssh_closed".into())
    }
    pub fn close(&self, id: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.remove(id) {
                session.close();
            }
        }
    }
    pub fn close_all(&self) {
        if let Ok(mut p) = self.pending.lock() {
            for (_, v) in p.drain() {
                let _ = v.socket.shutdown(Shutdown::Both);
            }
        }
        if let Ok(mut s) = self.sessions.lock() {
            for (_, v) in s.drain() {
                v.close();
            }
        }
    }
}
impl Drop for SshManager {
    fn drop(&mut self) {
        self.close_all();
    }
}

struct SshIo {
    channel: ssh2::Channel,
    input: VecDeque<Vec<u8>>,
    resize: Option<(u16, u16)>,
    exited: Option<Option<u32>>,
}
pub struct SshTerminal {
    socket: TcpStream,
    session: ssh2::Session,
    io: Mutex<SshIo>,
    closed: AtomicBool,
}
impl SshTerminal {
    pub fn write(&self, bytes: &[u8]) -> Result<(), String> {
        if self.closed.load(Ordering::Acquire) {
            return Err("ssh_closed".into());
        }
        let mut io = self.io.lock().map_err(|_| "ssh_state")?;
        if bytes.len() > 65536
            || io.input.iter().map(Vec::len).sum::<usize>() + bytes.len() > 262144
        {
            return Err("ssh_input_limit".into());
        }
        io.input.push_back(bytes.to_vec());
        Ok(())
    }
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        size(cols, rows)?;
        self.io.lock().map_err(|_| "ssh_state")?.resize = Some((cols, rows));
        Ok(())
    }
    pub fn read(&self) -> Result<Output, String> {
        if self.closed.load(Ordering::Acquire) {
            return Ok(Output::Exit { code: None });
        }
        let mut io = self.io.lock().map_err(|_| "ssh_state")?;
        if let Some(code) = io.exited {
            return Ok(Output::Exit { code });
        }
        if let Some((cols, rows)) = io.resize {
            match io
                .channel
                .request_pty_size(cols as u32, rows as u32, None, None)
            {
                Ok(()) => io.resize = None,
                Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => return Ok(Output::Pending),
                Err(_) => return Err("ssh_disconnected".into()),
            }
        }
        if let Some(mut bytes) = io.input.pop_front() {
            match io.channel.write(&bytes) {
                Ok(n) => {
                    if n < bytes.len() {
                        bytes.drain(..n);
                        io.input.push_front(bytes);
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => io.input.push_front(bytes),
                Err(_) => return Err("ssh_disconnected".into()),
            }
        }
        let mut bytes = vec![0; 8192];
        match io.channel.read(&mut bytes) {
            Ok(n) if n > 0 => {
                bytes.truncate(n);
                Ok(Output::Data { bytes })
            }
            Ok(_) if io.channel.eof() => {
                match io.channel.wait_close() {
                    Ok(()) => {}
                    Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => {
                        return Ok(Output::Pending)
                    }
                    Err(_) => return Err("ssh_disconnected".into()),
                }
                let code = io
                    .channel
                    .exit_status()
                    .ok()
                    .and_then(|c| u32::try_from(c).ok());
                io.exited = Some(code);
                Ok(Output::Exit { code })
            }
            Ok(_) => Ok(Output::Pending),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                drop(io);
                if let Err(error) = self.session.keepalive_send() {
                    if error.code() != ssh2::ErrorCode::Session(-37) {
                        return Err("ssh_disconnected".into());
                    }
                }
                std::thread::sleep(Duration::from_millis(10));
                Ok(Output::Pending)
            }
            Err(_) => Err("ssh_disconnected".into()),
        }
    }
    pub fn close(&self) {
        self.closed.store(true, Ordering::Release);
        let _ = self.socket.shutdown(Shutdown::Both);
    }
}
impl Drop for SshTerminal {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests;
