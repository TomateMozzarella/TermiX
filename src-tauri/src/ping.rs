#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    address: String,
    round_trip_ms: Option<u32>,
}

#[cfg(windows)]
pub fn probe(host: &str) -> Result<PingResult, String> {
    use std::net::ToSocketAddrs;
    let address = (host, 0)
        .to_socket_addrs()
        .map_err(|_| "ping_dns")?
        .next()
        .ok_or("ping_dns")?;
    let round_trip_ms = match address {
        std::net::SocketAddr::V4(value) => ipv4(*value.ip()),
        std::net::SocketAddr::V6(value) => ipv6(value),
    }?;
    Ok(PingResult {
        address: address.ip().to_string(),
        round_trip_ms,
    })
}

#[cfg(windows)]
const PAYLOAD: &[u8] = b"TermiX";

#[cfg(windows)]
fn ipv4(ip: std::net::Ipv4Addr) -> Result<Option<u32>, String> {
    use std::{mem::size_of, ptr::null};
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        NetworkManagement::IpHelper::{
            IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho, ICMP_ECHO_REPLY, IP_SUCCESS,
        },
    };
    #[repr(C)]
    struct ReplyBuffer {
        reply: ICMP_ECHO_REPLY,
        tail: [u8; 32],
    }
    let mut reply = std::mem::MaybeUninit::<ReplyBuffer>::zeroed();
    // SAFETY: The aligned buffer accommodates the reply header, data and additional ICMP
    // error bytes. The synchronous API borrows the buffers only until it returns.
    unsafe {
        let handle = IcmpCreateFile();
        if handle == INVALID_HANDLE_VALUE {
            return Err("ping_failed".into());
        }
        let count = IcmpSendEcho(
            handle,
            u32::from_ne_bytes(ip.octets()),
            PAYLOAD.as_ptr().cast(),
            PAYLOAD.len() as u16,
            null(),
            reply.as_mut_ptr().cast(),
            size_of::<ReplyBuffer>() as u32,
            1500,
        );
        IcmpCloseHandle(handle);
        if count == 0 {
            return Ok(None);
        }
        let header = &(*reply.as_ptr()).reply;
        Ok((header.Status == IP_SUCCESS).then_some(header.RoundTripTime))
    }
}

#[cfg(not(windows))]
pub fn probe(_host: &str) -> Result<PingResult, String> {
    Err("ping_failed".into())
}

#[cfg(windows)]
fn ipv6(address: std::net::SocketAddrV6) -> Result<Option<u32>, String> {
    use std::{
        mem::size_of,
        ptr::{null, null_mut},
    };
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        NetworkManagement::IpHelper::{
            Icmp6CreateFile, Icmp6SendEcho2, IcmpCloseHandle, ICMPV6_ECHO_REPLY_LH, IP_SUCCESS,
        },
        Networking::WinSock::{AF_INET6, IN6_ADDR, IN6_ADDR_0, SOCKADDR_IN6, SOCKADDR_IN6_0},
    };
    let sockaddr = |bytes, scope_id| SOCKADDR_IN6 {
        sin6_family: AF_INET6,
        sin6_port: 0,
        sin6_flowinfo: 0,
        sin6_addr: IN6_ADDR {
            u: IN6_ADDR_0 { Byte: bytes },
        },
        Anonymous: SOCKADDR_IN6_0 {
            sin6_scope_id: scope_id,
        },
    };
    let source = sockaddr([0; 16], 0);
    let destination = sockaddr(address.ip().octets(), address.scope_id());
    #[repr(C, align(8))]
    struct ReplyBuffer {
        header: ICMPV6_ECHO_REPLY_LH,
        tail: [u8; 64],
    }
    let mut reply = std::mem::MaybeUninit::<ReplyBuffer>::zeroed();
    // SAFETY: The call is synchronous. Both socket addresses and the aligned reply buffer
    // remain valid until it returns. The reply buffer includes space for data and status.
    unsafe {
        let handle = Icmp6CreateFile();
        if handle == INVALID_HANDLE_VALUE {
            return Err("ping_failed".into());
        }
        let count = Icmp6SendEcho2(
            handle,
            null_mut(),
            None,
            null(),
            &source,
            &destination,
            PAYLOAD.as_ptr().cast(),
            PAYLOAD.len() as u16,
            null(),
            reply.as_mut_ptr().cast(),
            size_of::<ReplyBuffer>() as u32,
            1500,
        );
        IcmpCloseHandle(handle);
        if count == 0 {
            return Ok(None);
        }
        let header = &(*reply.as_ptr()).header;
        Ok((header.Status == IP_SUCCESS).then_some(header.RoundTripTime))
    }
}
