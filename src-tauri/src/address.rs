use serde::Serialize;
use std::net::IpAddr;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
}

/// URL prefixes are paste conveniences, never a change of protocol or a source
/// of implicit HTTP(S) ports. The caller still opens verified SSH.
pub fn normalize(input: &str, fallback_port: u16) -> Result<Endpoint, String> {
    if input.len() > 2048 || input.chars().any(char::is_control) || fallback_port == 0 {
        return Err("invalid_host".into());
    }
    let mut value = input.trim();
    if let Some((scheme, authority)) = value.split_once("://") {
        if !["ssh", "http", "https"].contains(&scheme.to_ascii_lowercase().as_str()) {
            return Err("address_scheme".into());
        }
        value = authority;
    }
    if value.contains('@') || value.contains('%') || value.contains('\\') {
        return Err("address_credentials".into());
    }
    if value.contains('?') || value.contains('#') {
        return Err("address_path".into());
    }
    value = value.strip_suffix('/').unwrap_or(value);
    if value.contains('/') {
        return Err("address_path".into());
    }
    let (host, port) = if let Some(rest) = value.strip_prefix('[') {
        let (host, tail) = rest.split_once(']').ok_or("invalid_host")?;
        if !matches!(host.parse::<IpAddr>(), Ok(IpAddr::V6(_))) {
            return Err("invalid_host".into());
        }
        let port = if tail.is_empty() {
            fallback_port
        } else {
            parse_port(tail.strip_prefix(':').ok_or("invalid_host")?)?
        };
        (host, port)
    } else if value.matches(':').count() == 1 {
        let (host, port) = value.split_once(':').unwrap();
        (host, parse_port(port)?)
    } else {
        (value, fallback_port)
    };
    let host = canonical_host(host)?;
    Ok(Endpoint { host, port })
}

fn parse_port(value: &str) -> Result<u16, String> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err("invalid_host".into());
    }
    value
        .parse::<u16>()
        .ok()
        .filter(|p| *p > 0)
        .ok_or("invalid_host".into())
}

fn canonical_host(value: &str) -> Result<String, String> {
    if let Ok(ip) = value.parse::<IpAddr>() {
        return Ok(ip.to_string());
    }
    let host = value
        .strip_suffix('.')
        .unwrap_or(value)
        .to_ascii_lowercase();
    if host.is_empty()
        || host.len() > 253
        || host.contains(':')
        || host.bytes().all(|b| b.is_ascii_digit() || b == b'.')
        || host.split('.').any(|label| {
            label.is_empty()
                || label.len() > 63
                || label.starts_with('-')
                || label.ends_with('-')
                || !label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
    {
        return Err("invalid_host".into());
    }
    Ok(host)
}

#[cfg(test)]
mod tests {
    #[test]
    fn pasted_addresses_preserve_ssh_defaults_and_reject_ambiguity() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../src/address-cases.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let result = super::normalize(
                case["input"].as_str().unwrap(),
                case["fallback"].as_u64().unwrap() as u16,
            );
            if case.get("error").is_some() {
                assert_eq!(
                    result.unwrap_err(),
                    case["error"].as_str().unwrap(),
                    "{case}"
                );
            } else {
                let result = result.unwrap();
                assert_eq!(result.host, case["host"].as_str().unwrap(), "{case}");
                assert_eq!(result.port, case["port"].as_u64().unwrap() as u16, "{case}");
            }
        }
    }
}
