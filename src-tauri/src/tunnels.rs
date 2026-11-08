//! Explicit loopback-only TCP forwarding on an already verified SSH transport.
use crate::ssh::SshTerminal;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{IpAddr, Shutdown, SocketAddr, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub direction: String,
    pub bind_ip: String,
    pub bind_port: u16,
    pub target_host: String,
    pub target_port: u16,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub id: String,
    pub ssh_id: String,
    pub config: Config,
    pub state: String,
    pub connections: usize,
    pub error: Option<String>,
}
struct Tunnel {
    info: Mutex<Info>,
    terminal: Arc<SshTerminal>,
    stop: AtomicBool,
    peers: AtomicUsize,
    global_peers: Arc<AtomicUsize>,
}
#[derive(Default)]
pub struct Tunnels {
    listeners: Arc<AtomicUsize>,
    peers: Arc<AtomicUsize>,
    entries: Mutex<HashMap<String, Arc<Tunnel>>>,
}
fn validate(c: &mut Config) -> Result<IpAddr, String> {
    let ip: IpAddr = c.bind_ip.parse().map_err(|_| "tunnel_invalid")?;
    if !ip.is_loopback()
        || !matches!(c.direction.as_str(), "local" | "remote")
        || c.target_port == 0
    {
        return Err("tunnel_invalid".into());
    }
    c.target_host = crate::ssh::validate_endpoint(&c.target_host, c.target_port)?;
    if c.direction == "remote" && c.target_host.parse::<IpAddr>().is_err() {
        return Err("tunnel_target_ip".into());
    }
    Ok(ip)
}
fn ssh_retry<T>(
    terminal: &SshTerminal,
    mut operation: impl FnMut() -> Result<T, ssh2::Error>,
) -> Result<T, String> {
    let end = Instant::now() + Duration::from_secs(5);
    loop {
        if terminal.is_closed() {
            return Err("tunnel_closed".into());
        }
        match operation() {
            Ok(v) => return Ok(v),
            Err(e) if e.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < end => {
                thread::sleep(Duration::from_millis(10))
            }
            Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => {
                terminal.close();
                return Err("tunnel_timeout".into());
            }
            Err(e) => {
                #[cfg(test)]
                eprintln!("Tunnel control error: {:?}", e.code());
                return Err("tunnel_refused".into());
            }
        }
    }
}
struct Permit(Arc<AtomicUsize>);
impl Drop for Permit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}
fn claim(counter: &Arc<AtomicUsize>, limit: usize) -> Result<Permit, String> {
    counter
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
            (n < limit).then_some(n + 1)
        })
        .map_err(|_| "tunnel_limit")?;
    Ok(Permit(counter.clone()))
}
enum Bound {
    Local(TcpListener),
    Remote(ssh2::Listener),
}
impl Tunnels {
    pub fn start(
        &self,
        ssh_id: String,
        terminal: Arc<SshTerminal>,
        mut config: Config,
    ) -> Result<Info, String> {
        let ip = validate(&mut config)?;
        let permit = claim(&self.listeners, 8)?;
        if terminal.is_closed() {
            return Err("tunnel_closed".into());
        }
        let mut entries = self.entries.lock().map_err(|_| "tunnel_state")?;
        entries.retain(|_, t| !t.stop.load(Ordering::Acquire) && !t.terminal.is_closed());
        if entries.len() >= 8 {
            return Err("tunnel_limit".into());
        }
        drop(entries);
        let bound = if config.direction == "local" {
            let listener = TcpListener::bind(SocketAddr::new(ip, config.bind_port))
                .map_err(|_| "tunnel_bind")?;
            listener.set_nonblocking(true).map_err(|_| "tunnel_bind")?;
            config.bind_port = listener.local_addr().map_err(|_| "tunnel_bind")?.port();
            Bound::Local(listener)
        } else {
            let _gate = terminal.remote.gate.try_lock().map_err(|_| "tunnel_busy")?;
            let (listener, port) = ssh_retry(&terminal, || {
                terminal.ssh_session().channel_forward_listen(
                    config.bind_port,
                    Some(&config.bind_ip),
                    Some(8),
                )
            })?;
            config.bind_port = port;
            Bound::Remote(listener)
        };
        let info = Info {
            id: uuid::Uuid::new_v4().to_string(),
            ssh_id,
            config,
            state: "running".into(),
            connections: 0,
            error: None,
        };
        let tunnel = Arc::new(Tunnel {
            info: Mutex::new(info.clone()),
            terminal,
            stop: AtomicBool::new(false),
            peers: AtomicUsize::new(0),
            global_peers: self.peers.clone(),
        });
        self.entries
            .lock()
            .map_err(|_| "tunnel_state")?
            .insert(info.id.clone(), tunnel.clone());
        thread::spawn(move || {
            let _permit = permit;
            listen(tunnel, bound)
        });
        Ok(info)
    }
    pub fn list(&self, ssh_id: &str) -> Vec<Info> {
        self.entries
            .lock()
            .map(|entries| {
                entries
                    .values()
                    .filter_map(|t| {
                        let mut i = t.info.lock().ok()?.clone();
                        if i.ssh_id != ssh_id {
                            return None;
                        }
                        i.connections = t.peers.load(Ordering::Acquire);
                        if t.terminal.is_closed() {
                            i.state = "stopped".into()
                        }
                        Some(i)
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
    pub fn stop(&self, id: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            if let Some(t) = entries.remove(id) {
                t.stop.store(true, Ordering::Release);
            }
        }
    }
    pub fn stop_all(&self) {
        if let Ok(mut entries) = self.entries.lock() {
            for (_, t) in entries.drain() {
                t.stop.store(true, Ordering::Release);
            }
        }
    }
}
impl Drop for Tunnels {
    fn drop(&mut self) {
        self.stop_all();
    }
}
fn listen(t: Arc<Tunnel>, mut listener: Bound) {
    while !t.stop.load(Ordering::Acquire) && !t.terminal.is_closed() {
        if t.peers.load(Ordering::Acquire) >= 8 || t.global_peers.load(Ordering::Acquire) >= 64 {
            thread::sleep(Duration::from_millis(25));
            continue;
        }
        let config = match t.info.lock() {
            Ok(i) => i.config.clone(),
            Err(_) => break,
        };
        let pair = match &mut listener {
            Bound::Local(l) => match l.accept() {
                Ok((tcp, source)) => match ssh_retry(&t.terminal, || {
                    t.terminal.ssh_session().channel_direct_tcpip(
                        &config.target_host,
                        config.target_port,
                        Some((&source.ip().to_string(), source.port())),
                    )
                }) {
                    Ok(channel) => Some((tcp, channel)),
                    Err(e) => {
                        if let Ok(mut i) = t.info.lock() {
                            i.error = Some(e);
                        }
                        None
                    }
                },
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => None,
                Err(_) => break,
            },
            Bound::Remote(l) => match l.accept() {
                Ok(mut channel) => {
                    let address =
                        SocketAddr::new(config.target_host.parse().unwrap(), config.target_port);
                    match TcpStream::connect_timeout(&address, Duration::from_secs(2)) {
                        Ok(tcp) => Some((tcp, channel)),
                        Err(_) => {
                            if let Ok(mut i) = t.info.lock() {
                                i.error = Some("tunnel_target".into())
                            }
                            close_channel(&t.terminal, &mut channel);
                            None
                        }
                    }
                }
                Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => None,
                Err(_) => break,
            },
        };
        if let Some((tcp, mut channel)) = pair {
            if let Ok(mut i) = t.info.lock() {
                i.error = None;
            }
            t.peers.fetch_add(1, Ordering::AcqRel);
            let slot = match claim(&t.global_peers, 64) {
                Ok(slot) => slot,
                Err(_) => {
                    t.peers.fetch_sub(1, Ordering::AcqRel);
                    let _ = tcp.shutdown(Shutdown::Both);
                    close_channel(&t.terminal, &mut channel);
                    continue;
                }
            };
            let owned = t.clone();
            thread::spawn(move || {
                let _slot = slot;
                bridge(&owned, tcp, channel);
                owned.peers.fetch_sub(1, Ordering::AcqRel);
            });
        } else {
            thread::sleep(Duration::from_millis(20));
        }
    }
    t.stop.store(true, Ordering::Release);
    if let Ok(mut i) = t.info.lock() {
        i.state = "stopped".into();
    }
    // ssh2 cancels a remote listener on Drop. On transport failure the SSH
    // disconnect also releases it; cancellation acknowledgement is server-owned.
}
fn close_channel(terminal: &SshTerminal, channel: &mut ssh2::Channel) {
    if ssh_retry(terminal, || channel.close()).is_ok() {
        let _ = ssh_retry(terminal, || channel.wait_close());
    }
}
fn bridge(t: &Tunnel, mut tcp: TcpStream, mut channel: ssh2::Channel) {
    #[cfg(test)]
    eprintln!("Tunnel bridge starting");
    if tcp.set_nonblocking(true).is_err() {
        #[cfg(test)]
        eprintln!("Tunnel bridge nonblocking setup failed");
        close_channel(&t.terminal, &mut channel);
        return;
    }
    let (mut to_remote, mut to_local) = (Vec::new(), Vec::new());
    let (mut tcp_eof, mut ssh_eof, mut sent_eof, mut local_eof) = (false, false, false, false);
    let mut buf = [0u8; 16384];
    let mut write_pending = false;
    #[cfg(test)]
    let (mut incoming, mut returned) = (0usize, 0usize);
    while !t.stop.load(Ordering::Acquire) && !t.terminal.is_closed() {
        let mut progressed = false;
        if !tcp_eof && !write_pending && to_remote.len() < 65536 {
            let available = (65536 - to_remote.len()).min(buf.len());
            match tcp.read(&mut buf[..available]) {
                Ok(0) => tcp_eof = true,
                Ok(n) => {
                    #[cfg(test)]
                    {
                        incoming += n;
                    }
                    to_remote.extend_from_slice(&buf[..n]);
                    progressed = true;
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    #[cfg(test)]
                    eprintln!("Tunnel bridge tcp-read: {:?}", e);
                    #[cfg(not(test))]
                    let _ = e;
                    break;
                }
            }
        }
        if !to_remote.is_empty() {
            match channel.write(&to_remote) {
                Ok(0) => {}
                Ok(n) => {
                    write_pending = false;
                    to_remote.drain(..n);
                    progressed = true;
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    write_pending = true;
                }
                Err(e) => {
                    #[cfg(test)]
                    eprintln!("Tunnel bridge ssh-write: {:?}", e);
                    #[cfg(not(test))]
                    let _ = e;
                    break;
                }
            }
        }
        if tcp_eof && to_remote.is_empty() && !sent_eof {
            match channel.send_eof() {
                Ok(()) => sent_eof = true,
                Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => {}
                Err(e) => {
                    #[cfg(test)]
                    eprintln!("Tunnel bridge ssh-eof: {:?}", e);
                    #[cfg(not(test))]
                    let _ = e;
                    break;
                }
            }
        }
        if !ssh_eof && to_local.len() < 65536 {
            let available = (65536 - to_local.len()).min(buf.len());
            match channel.read(&mut buf[..available]) {
                Ok(0) if channel.eof() => ssh_eof = true,
                Ok(0) => {}
                Ok(n) => {
                    #[cfg(test)]
                    {
                        returned += n;
                    }
                    to_local.extend_from_slice(&buf[..n]);
                    progressed = true;
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    #[cfg(test)]
                    eprintln!("Tunnel bridge ssh-read: {:?}", e);
                    #[cfg(not(test))]
                    let _ = e;
                    break;
                }
            }
        }
        if !to_local.is_empty() {
            match tcp.write(&to_local) {
                Ok(0) => break,
                Ok(n) => {
                    to_local.drain(..n);
                    progressed = true;
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    #[cfg(test)]
                    eprintln!("Tunnel bridge tcp-write: {:?}", e);
                    #[cfg(not(test))]
                    let _ = e;
                    break;
                }
            }
        }
        if ssh_eof && to_local.is_empty() && !local_eof {
            let _ = tcp.shutdown(Shutdown::Write);
            local_eof = true;
        }
        if sent_eof && local_eof {
            break;
        }
        if !progressed {
            thread::sleep(Duration::from_millis(5));
        }
    }
    #[cfg(test)]
    eprintln!("Tunnel bridge end: incoming={incoming} returned={returned} tcp_eof={tcp_eof} ssh_eof={ssh_eof} sent_eof={sent_eof} stopped={} closed={}", t.stop.load(Ordering::Acquire), t.terminal.is_closed());
    let _ = tcp.shutdown(Shutdown::Both);
    close_channel(&t.terminal, &mut channel);
}
#[cfg(test)]
mod tests {
    #[test]
    fn forwarding_is_explicit_and_loopback_bound() {
        let mut c = super::Config {
            direction: "local".into(),
            bind_ip: "0.0.0.0".into(),
            bind_port: 0,
            target_host: "example.test".into(),
            target_port: 80,
        };
        assert!(super::validate(&mut c).is_err());
        c.bind_ip = "127.0.0.1".into();
        assert!(super::validate(&mut c).is_ok());
        c.direction = "remote".into();
        assert!(super::validate(&mut c).is_err());
        c.target_host = "127.0.0.1".into();
        assert!(super::validate(&mut c).is_ok());
        c.target_port = 0;
        assert!(super::validate(&mut c).is_err());
    }
}
