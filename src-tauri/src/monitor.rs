//! Fixed, read-only Linux, FreeBSD, macOS and Windows metrics over a separate channel of the verified SSH session.
use crate::ssh::SshTerminal;
use serde::Serialize;
use std::{
    io::Read,
    time::{Duration, Instant},
};
const COMMAND: &str = r#"LC_ALL=C; export LC_ALL
os=$(uname -s)
if [ "$os" = FreeBSD ] || [ "$os" = Darwin ]; then
  boot=$(sysctl -n kern.boottime) && now=$(date +%s) || exit 1
  if [ "$os" = FreeBSD ]; then
    cpu=$(sysctl -n kern.cp_time) && pages=$(sysctl -n vm.stats.vm.v_page_count) &&
    free=$(sysctl -n vm.stats.vm.v_free_count) && page_size=$(sysctl -n hw.pagesize) || exit 1
    printf 'TERMIX_MONITOR_FREEBSD_V1\n'
    printf '%s\n' "$cpu" | awk 'NF==5 {printf "cpu %.0f %.0f\n",$1+$2+$3+$4+$5,$5}'
    printf '%s %s %s\n' "$pages" "$free" "$page_size" | awk 'NF==3 {printf "mem %.0f %.0f\n",$1*$3/1024,$2*$3/1024}'
  else
    physical=$(sysctl -n hw.memsize) && vm=$(vm_stat) || exit 1
    printf 'TERMIX_MONITOR_MACOS_V1\n'
    printf '%s\n' "$vm" | awk -v total="$physical" '
      NR==1 && $8 ~ /^[0-9]+$/ {page_size=$8}
      /^Pages free:/ && $3 ~ /^[0-9]+\.$/ {free=int($3); found=1}
      END {if (page_size>0 && found && total>0) printf "mem %.0f %.0f\n",total/1024,free*page_size/1024}
    '
    top -l 2 -s 1 -n 0 2>/dev/null | awk '
      /^CPU usage:/ {
        count++
        idle=$7
        valid=(idle ~ /^[0-9]+([.][0-9]+)?%$/ && $8=="idle")
        sub(/%$/,"",idle)
      }
      END {if (count>=2 && valid && idle>=0 && idle<=100) printf "cpu_busy %.0f\n",(100-idle)*100}
    '
  fi
  netstat -ibn 2>/dev/null | awk '
    $1=="Name" && $3=="Network" {
      for (i=1;i<=NF;i++) {
        if ($i=="Ibytes") in_from_end=NF-i+1
        if ($i=="Obytes") out_from_end=NF-i+1
      }
      next
    }
    in_from_end && out_from_end && $3 ~ /^<Link#[0-9]+>$/ {
      name=$1
      sub(/[*]$/,"",name)
      if (name ~ /^lo[0-9]+$/ || seen[name]) next
      seen[name]=1
      in_field=NF-in_from_end+1
      out_field=NF-out_from_end+1
      if (in_field>3 && out_field>3 && $in_field ~ /^[0-9]+$/ && $out_field ~ /^[0-9]+$/) {
        received+=$in_field
        sent+=$out_field
        found=1
      }
    }
    END {if (found) printf "net %.0f %.0f\n",received,sent}
  '
  df -Pk / 2>/dev/null | awk 'NR==2{print "disk",$2,$3}'
  printf '%s\n%s\n' "$boot" "$now" | awk 'NR==1 && $2=="sec" && $3=="=" {sub(/,$/,"",$4); if ($4 ~ /^[0-9]+$/) boot=$4} NR==2 && boot>0 && $1>=boot {printf "uptime %.0f\n",$1-boot}'
  who 2>/dev/null | awk '{u[$1]=1}END{for(x in u)n++;print "users",n+0}'
  exit
fi
test -r /proc/stat || exit 1
for tool in awk df ps who; do command -v "$tool" >/dev/null 2>&1 || exit 1; done
printf 'TERMIX_MONITOR_V1\n'
awk '/^cpu / {t=0;for(i=2;i<=9;i++)t+=$i;printf "cpu %.0f %.0f\n",t,$5+$6}' /proc/stat
awk '/^MemTotal:/{t=$2}/^MemAvailable:/{a=$2}END{print "mem",t,a}' /proc/meminfo
df -Pk / 2>/dev/null | awk 'NR==2{print "disk",$2,$3}'
awk '{print "uptime",int($1)}' /proc/uptime
awk -F '[: ]+' 'NR>2 && $2!="lo"{rx+=$3;tx+=$11}END{printf "net %.0f %.0f\n",rx,tx}' /proc/net/dev
ps -eo args= 2>/dev/null | awk '/^sshd(-session)?: [^[]+@/{n++}END{print "ssh",n+0}'
who 2>/dev/null | awk '{u[$1]=1}END{for(x in u)n++;print "users",n+0}'
"#;
const WINDOWS_COMMAND: &str = r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$os = Get-CimInstance -ClassName Win32_OperatingSystem
$disk = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object DeviceID -eq $os.SystemDrive | Select-Object -First 1
if (!$disk -or !$disk.Size) { exit 1 }
$uptime = [long][Math]::Max(0, [Math]::Floor(($os.LocalDateTime - $os.LastBootUpTime).TotalSeconds))
$diskTotal = [uint64][Math]::Floor($disk.Size / 1KB)
$diskUsed = [uint64][Math]::Floor(($disk.Size - $disk.FreeSpace) / 1KB)
'TERMIX_MONITOR_WINDOWS_V1'
'mem {0} {1}' -f $os.TotalVisibleMemorySize, $os.FreePhysicalMemory
'disk {0} {1}' -f $diskTotal, $diskUsed
'uptime ' + $uptime
try {
    $load = Get-CimInstance -ClassName Win32_Processor | Where-Object { $null -ne $_.LoadPercentage } | Measure-Object -Property LoadPercentage -Average
    if ($load.Count -gt 0) { 'cpu_busy ' + [int]($load.Average * 100) }
} catch {}
"#;

#[derive(Clone, Copy)]
pub(crate) enum Platform {
    Unix,
    Windows,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub cpu_total: Option<u64>,
    pub cpu_idle: Option<u64>,
    pub cpu_busy_basis_points: Option<u64>,
    pub memory_total: u64,
    pub memory_used: u64,
    pub disk_total: u64,
    pub disk_used: u64,
    pub uptime: u64,
    pub received: Option<u64>,
    pub sent: Option<u64>,
    pub ssh_sessions: Option<u64>,
    pub users: Option<u64>,
    pub windows: bool,
}
fn parse(text: &str) -> Result<Sample, String> {
    let mut lines = text.lines();
    let (linux, has_cpu, windows) = match lines.next() {
        Some("TERMIX_MONITOR_V1") => (true, true, false),
        Some("TERMIX_MONITOR_FREEBSD_V1") => (false, true, false),
        Some("TERMIX_MONITOR_MACOS_V1") => (false, false, false),
        Some("TERMIX_MONITOR_WINDOWS_V1") => (false, false, true),
        _ => return Err("monitor_unavailable".into()),
    };
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
    let cpu = if has_cpu { Some(pair("cpu")?) } else { None };
    let cpu_busy_basis_points = if !has_cpu && values.contains_key("cpu_busy") {
        let busy = single("cpu_busy")?;
        (busy <= 10_000).then_some(busy)
    } else {
        None
    };
    let (mt, ma) = pair("mem")?;
    let (dt, du) = pair("disk")?;
    let net = if linux || values.contains_key("net") {
        Some(pair("net")?)
    } else {
        None
    };
    let bytes = |v: u64| {
        v.checked_mul(1024)
            .ok_or_else(|| "monitor_unavailable".to_string())
    };
    if cpu.is_some_and(|(total, idle)| idle > total) || ma > mt || du > dt || mt == 0 || dt == 0 {
        return Err("monitor_unavailable".into());
    }
    Ok(Sample {
        cpu_total: cpu.map(|(total, _)| total),
        cpu_idle: cpu.map(|(_, idle)| idle),
        cpu_busy_basis_points,
        memory_total: bytes(mt)?,
        memory_used: bytes(mt - ma)?,
        disk_total: bytes(dt)?,
        disk_used: bytes(du)?,
        uptime: single("uptime")?,
        received: net.map(|(rx, _)| rx),
        sent: net.map(|(_, tx)| tx),
        ssh_sessions: if linux { Some(single("ssh")?) } else { None },
        users: if windows {
            None
        } else {
            Some(single("users")?)
        },
        windows,
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
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut platform = terminal
        .remote
        .monitor_platform
        .lock()
        .map_err(|_| "monitor_busy")?;
    let selected = if let Some(platform) = *platform {
        platform
    } else {
        match collect(terminal, "uname -s", deadline)
            .as_deref()
            .map(str::trim)
        {
            Ok("Linux" | "FreeBSD" | "Darwin") => Platform::Unix,
            _ => Platform::Windows,
        }
    };
    let command = match selected {
        // Use POSIX sh even when the remote login shell is csh.
        Platform::Unix => format!("/bin/sh -c '{}'", COMMAND.replace('\'', "'\"'\"'")),
        Platform::Windows => {
            use base64::Engine;
            let bytes: Vec<_> = WINDOWS_COMMAND
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect();
            let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
            format!("powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand {encoded}")
        }
    };
    let sample = parse(&collect(terminal, &command, deadline)?)?;
    *platform = Some(selected);
    Ok(sample)
}

fn collect(terminal: &SshTerminal, command: &str, deadline: Instant) -> Result<String, String> {
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
            match channel.exec(command) {
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
        String::from_utf8(data).map_err(|_| "monitor_unavailable".into())
    })();
    let _ = channel.close();
    result
}
#[cfg(test)]
mod tests {
    #[test]
    fn parses_windows_system_drive_and_optional_counters() {
        let sample = super::parse("TERMIX_MONITOR_WINDOWS_V1\r\nmem 2048 512\r\ndisk 4096 1024\r\nuptime 120\r\ncpu_busy 3700\r\n").unwrap();
        assert!(sample.windows);
        assert_eq!(sample.cpu_busy_basis_points, Some(3700));
        assert_eq!(sample.memory_used, 1536 * 1024);
        assert_eq!(sample.disk_used, 1024 * 1024);
        assert_eq!(sample.uptime, 120);
        assert_eq!(sample.users, None);
    }

    #[test]
    fn parses_macos_without_unavailable_counters() {
        let sample = super::parse(
            "TERMIX_MONITOR_MACOS_V1\nmem 2048 512\ndisk 4096 1024\nuptime 120\nusers 2\n",
        )
        .unwrap();
        assert_eq!(sample.memory_used, 1536 * 1024);
        assert_eq!(sample.cpu_total, None);
        assert_eq!(sample.cpu_busy_basis_points, None);
        let with_cpu = "TERMIX_MONITOR_MACOS_V1\ncpu_busy 1234\nmem 2048 512\ndisk 4096 1024\nuptime 120\nusers 2\n";
        assert_eq!(
            super::parse(with_cpu).unwrap().cpu_busy_basis_points,
            Some(1234)
        );
        assert_eq!(sample.received, None);
    }

    #[test]
    fn parses_freebsd_without_linux_only_counters() {
        let input = "TERMIX_MONITOR_FREEBSD_V1\ncpu 100 70\nmem 2048 512\ndisk 4096 1024\nuptime 120\nusers 2\n";
        let sample = super::parse(input).unwrap();
        assert_eq!(sample.memory_used, 1536 * 1024);
        assert_eq!(sample.ssh_sessions, None);
        assert_eq!(sample.received, None);
        assert_eq!(sample.uptime, 120);
        let counters = super::parse(&format!("{input}net 123 456\n")).unwrap();
        assert_eq!((counters.received, counters.sent), (Some(123), Some(456)));
    }
    #[test]
    fn parses_bounded_linux_sample_and_rejects_invalid_metrics() {
        let s="TERMIX_MONITOR_V1\ncpu 100 70\nmem 2048 512\ndisk 4096 1024\nuptime 120\nnet 1000 2000\nssh 3\nusers 2\n";
        let m = super::parse(s).unwrap();
        assert_eq!(m.memory_used, 1536 * 1024);
        assert_eq!(m.ssh_sessions, Some(3));
        assert!(super::parse(&s.replace("net 1000 2000\n", "")).is_err());
        assert!(super::parse(&s.replace("cpu 100 70", "cpu 1 70")).is_err());
        assert!(super::parse(&s.replace("mem 2048 512", "mem 18446744073709551615 0")).is_err());
        assert!(super::parse("not linux").is_err());
    }
}
