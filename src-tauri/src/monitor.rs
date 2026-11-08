//! Fixed, read-only Linux metrics over a separate channel of the verified SSH session.
use crate::ssh::SshTerminal;
use serde::Serialize;
use std::{
    io::Read,
    time::{Duration, Instant},
};
const COMMAND: &str = r#"LC_ALL=C; export LC_ALL; test -r /proc/stat || exit 1
printf 'TERMIX_MONITOR_V1\n'
awk '/^cpu / {t=0;for(i=2;i<=9;i++)t+=$i;printf "cpu %.0f %.0f\n",t,$5+$6}' /proc/stat
awk '/^MemTotal:/{t=$2}/^MemAvailable:/{a=$2}END{print "mem",t,a}' /proc/meminfo
df -Pk / 2>/dev/null | awk 'NR==2{print "disk",$2,$3}'
awk '{print "uptime",int($1)}' /proc/uptime
awk -F '[: ]+' 'NR>2 && $2!="lo"{rx+=$3;tx+=$11}END{printf "net %.0f %.0f\n",rx,tx}' /proc/net/dev
ps -eo args= 2>/dev/null | awk '/^sshd(-session)?: [^[]+@/{n++}END{print "ssh",n+0}'
who 2>/dev/null | awk '{u[$1]=1}END{for(x in u)n++;print "users",n+0}'
"#;
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub cpu_total: u64,
    pub cpu_idle: u64,
    pub memory_total: u64,
    pub memory_used: u64,
    pub disk_total: u64,
    pub disk_used: u64,
    pub uptime: u64,
    pub received: u64,
    pub sent: u64,
    pub ssh_sessions: u64,
    pub users: u64,
}
fn parse(text: &str) -> Result<Sample, String> {
    let mut lines = text.lines();
    if lines.next() != Some("TERMIX_MONITOR_V1") {
        return Err("monitor_unavailable".into());
    }
    let mut values = std::collections::HashMap::new();
    for line in lines {
        let mut fields = line.split_whitespace();
        let key = fields.next().ok_or("monitor_unavailable")?;
        let nums = fields
            .map(str::parse::<u64>)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "monitor_unavailable")?;
        if values.insert(key, nums).is_some() {
            return Err("monitor_unavailable".into());
        }
    }
    let pair = |key| -> Result<(u64, u64), String> {
        let v = values.get(key).ok_or("monitor_unavailable")?;
        if v.len() != 2 {
            return Err("monitor_unavailable".into());
        }
        Ok((v[0], v[1]))
    };
    let single = |key| -> Result<u64, String> {
        let v = values.get(key).ok_or("monitor_unavailable")?;
        if v.len() != 1 {
            return Err("monitor_unavailable".into());
        }
        Ok(v[0])
    };
    let (cpu_total, cpu_idle) = pair("cpu")?;
    let (mt, ma) = pair("mem")?;
    let (dt, du) = pair("disk")?;
    let (received, sent) = pair("net")?;
    let bytes = |v: u64| {
        v.checked_mul(1024)
            .ok_or_else(|| "monitor_unavailable".to_string())
    };
    if cpu_idle > cpu_total || ma > mt || du > dt || mt == 0 || dt == 0 {
        return Err("monitor_unavailable".into());
    }
    Ok(Sample {
        cpu_total,
        cpu_idle,
        memory_total: bytes(mt)?,
        memory_used: bytes(mt - ma)?,
        disk_total: bytes(dt)?,
        disk_used: bytes(du)?,
        uptime: single("uptime")?,
        received,
        sent,
        ssh_sessions: single("ssh")?,
        users: single("users")?,
    })
}
pub fn sample(terminal: &SshTerminal) -> Result<Sample, String> {
    let _gate = terminal
        .remote
        .gate
        .try_lock()
        .map_err(|_| "monitor_busy")?;
    if terminal.is_closed() {
        return Err("monitor_unavailable".into());
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    let retry = |op: &mut dyn FnMut() -> Result<ssh2::Channel, ssh2::Error>| loop {
        match op() {
            Ok(v) => return Ok(v),
            Err(e) if e.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(10))
            }
            _ => return Err("monitor_unavailable".to_string()),
        }
    };
    let mut channel = retry(&mut || terminal.ssh_session().channel_session())?;
    let result = (|| {
        loop {
            match channel.exec(COMMAND) {
                Ok(()) => break,
                Err(e)
                    if e.code() == ssh2::ErrorCode::Session(-37) && Instant::now() < deadline =>
                {
                    std::thread::sleep(Duration::from_millis(10))
                }
                _ => return Err("monitor_unavailable".into()),
            }
        }
        let mut data = Vec::new();
        let mut buf = [0u8; 2048];
        loop {
            if terminal.is_closed() || Instant::now() >= deadline {
                return Err("monitor_unavailable".into());
            }
            match channel.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    data.extend_from_slice(&buf[..n]);
                    if data.len() > 16384 {
                        return Err("monitor_unavailable".into());
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(20))
                }
                Err(_) => return Err("monitor_unavailable".into()),
            }
        }
        parse(std::str::from_utf8(&data).map_err(|_| "monitor_unavailable")?)
    })();
    let _ = channel.close();
    result
}
#[cfg(test)]
mod tests {
    #[test]
    fn parses_bounded_linux_sample_and_rejects_invalid_metrics() {
        let s="TERMIX_MONITOR_V1\ncpu 100 70\nmem 2048 512\ndisk 4096 1024\nuptime 120\nnet 1000 2000\nssh 3\nusers 2\n";
        let m = super::parse(s).unwrap();
        assert_eq!(m.memory_used, 1536 * 1024);
        assert_eq!(m.ssh_sessions, 3);
        assert!(super::parse(&s.replace("cpu 100 70", "cpu 1 70")).is_err());
        assert!(super::parse(&s.replace("mem 2048 512", "mem 18446744073709551615 0")).is_err());
        assert!(super::parse("not linux").is_err());
    }
}

