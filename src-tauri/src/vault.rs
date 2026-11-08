use zeroize::Zeroizing;

static PORTABLE_NAMESPACE: std::sync::OnceLock<String> = std::sync::OnceLock::new();
pub fn set_portable_namespace(root: Option<std::path::PathBuf>) {
    if let Some(root) = root {
        use sha2::{Digest, Sha256};
        let value = format!(
            "TermiX:portable:{:x}:ssh:",
            Sha256::digest(root.to_string_lossy().to_lowercase().as_bytes())
        );
        let _ = PORTABLE_NAMESPACE.set(value);
    }
}
fn target(host: &str, port: u16, username: &str) -> Vec<u16> {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(format!("{host}\0{port}\0{username}").as_bytes());
    let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}{hex}",
        PORTABLE_NAMESPACE
            .get()
            .map(String::as_str)
            .unwrap_or("TermiX:ssh:")
    )
    .encode_utf16()
    .chain(Some(0))
    .collect()
}

#[cfg(windows)]
pub fn save(host: &str, port: u16, username: &str, password: &str) -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::*;
    let mut name = target(host, port, username);
    let mut user: Vec<u16> = username.encode_utf16().chain(Some(0)).collect();
    let mut secret = Zeroizing::new(password.encode_utf16().collect::<Vec<u16>>());
    if secret.len() * 2 > 2560 {
        return Err("vault_failed".into());
    }
    // SAFETY: all pointed-to buffers remain live during CredWriteW; Windows
    // copies the credential. The caller's password is never returned to JS.
    let result = unsafe {
        let mut credential: CREDENTIALW = std::mem::zeroed();
        credential.Type = CRED_TYPE_GENERIC;
        credential.TargetName = name.as_mut_ptr();
        credential.UserName = user.as_mut_ptr();
        credential.CredentialBlobSize = (secret.len() * 2) as u32;
        credential.CredentialBlob = secret.as_mut_ptr().cast();
        credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
        CredWriteW(&credential, 0)
    };
    if result == 0 {
        Err("vault_failed".into())
    } else {
        Ok(())
    }
}

#[cfg(windows)]
pub fn read(host: &str, port: u16, username: &str) -> Result<Zeroizing<String>, String> {
    use windows_sys::Win32::Security::Credentials::*;
    let name = target(host, port, username);
    let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
    // SAFETY: CredReadW returns an OS-owned allocation, inspected only within
    // its bounds and released with CredFree on every successful read.
    unsafe {
        if CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
            return Err("vault_missing".into());
        }
        let c = &*credential;
        let result = if c.CredentialBlobSize % 2 != 0
            || c.CredentialBlobSize > 2560
            || c.CredentialBlob.is_null()
        {
            Err("vault_failed".into())
        } else {
            let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize);
            let words = Zeroizing::new(
                bytes
                    .chunks_exact(2)
                    .map(|b| u16::from_le_bytes([b[0], b[1]]))
                    .collect::<Vec<_>>(),
            );
            String::from_utf16(&words)
                .map(Zeroizing::new)
                .map_err(|_| "vault_failed".into())
        };
        if !c.CredentialBlob.is_null() {
            std::ptr::write_bytes(c.CredentialBlob, 0, c.CredentialBlobSize as usize);
        }
        CredFree(credential.cast());
        result
    }
}

#[cfg(windows)]
pub fn delete(host: &str, port: u16, username: &str) -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::*;
    let name = target(host, port, username);
    // SAFETY: target is a live NUL-terminated buffer; deletes only TermiX's
    // deterministic credential for this validated endpoint and username.
    if unsafe { CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() != Some(1168) {
            return Err("vault_failed".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn save(_: &str, _: u16, _: &str, _: &str) -> Result<(), String> {
    Err("vault_unavailable".into())
}
#[cfg(not(windows))]
pub fn read(_: &str, _: u16, _: &str) -> Result<Zeroizing<String>, String> {
    Err("vault_unavailable".into())
}
#[cfg(not(windows))]
pub fn delete(_: &str, _: u16, _: &str) -> Result<(), String> {
    Err("vault_unavailable".into())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn vault_roundtrip_update_delete() {
        let host = format!("test-{}", uuid::Uuid::new_v4());
        super::save(&host, 22, "test", "test-only-ö").unwrap();
        assert_eq!(&**super::read(&host, 22, "test").unwrap(), "test-only-ö");
        super::save(&host, 22, "test", "updated").unwrap();
        assert_eq!(&**super::read(&host, 22, "test").unwrap(), "updated");
        super::delete(&host, 22, "test").unwrap();
        assert!(super::read(&host, 22, "test").is_err());
        super::delete(&host, 22, "test").unwrap();
    }
}
#[cfg(windows)]
pub fn clear_installed() -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::*;
    if std::env::current_exe()
        .ok()
        .and_then(|p| crate::app_data::portable_root(&p))
        .is_some()
    {
        return Err("vault_failed".into());
    }
    let filter: Vec<u16> = "TermiX:ssh:*".encode_utf16().chain(Some(0)).collect();
    let mut count = 0u32;
    let mut credentials: *mut *mut CREDENTIALW = std::ptr::null_mut();
    unsafe {
        if CredEnumerateW(filter.as_ptr(), 0, &mut count, &mut credentials) == 0 {
            return if std::io::Error::last_os_error().raw_os_error() == Some(1168) {
                Ok(())
            } else {
                Err("vault_failed".into())
            };
        }
        let mut failed = false;
        for ptr in std::slice::from_raw_parts(credentials, count as usize) {
            let c = &**ptr;
            if c.Type != CRED_TYPE_GENERIC || c.TargetName.is_null() {
                continue;
            }
            let mut len = 0usize;
            while len < 128 && *c.TargetName.add(len) != 0 {
                len += 1;
            }
            let name = String::from_utf16_lossy(std::slice::from_raw_parts(c.TargetName, len));
            if cleanup_target(&name) && CredDeleteW(c.TargetName, CRED_TYPE_GENERIC, 0) == 0 {
                failed = true;
            }
            if !c.CredentialBlob.is_null() && c.CredentialBlobSize <= 2560 {
                std::ptr::write_bytes(c.CredentialBlob, 0, c.CredentialBlobSize as usize);
            }
        }
        CredFree(credentials.cast());
        if failed {
            Err("vault_failed".into())
        } else {
            Ok(())
        }
    }
}
fn cleanup_target(name: &str) -> bool {
    name.strip_prefix("TermiX:ssh:")
        .is_some_and(|s| s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()))
}
#[cfg(not(windows))]
pub fn clear_installed() -> Result<(), String> {
    Err("vault_unavailable".into())
}
#[cfg(test)]
mod cleanup_tests {
    #[test]
    fn cleanup_never_matches_other_app_or_portable_credentials() {
        assert!(super::cleanup_target(&format!(
            "TermiX:ssh:{}",
            "a".repeat(64)
        )));
        for name in [
            "OtherApp:ssh:abc",
            "TermiX:portable:abc:ssh:abc",
            "TermiX:ssh:not-a-hash",
        ] {
            assert!(!super::cleanup_target(name));
        }
    }
}
#[cfg(all(test, windows))]
mod uninstall_tests {
    #[test]
    fn isolated_ci_cleanup_removes_only_installed_termix_credentials() {
        if std::env::var("CI").as_deref() != Ok("true") {
            return;
        }
        use windows_sys::Win32::Security::Credentials::*;
        let host = format!("cleanup-{}", uuid::Uuid::new_v4());
        super::save(&host, 22, "fixture", "fixture-only").unwrap();
        let other = format!("OtherTermiXTest:{}", uuid::Uuid::new_v4());
        let portable = format!(
            "TermiX:portable:test:ssh:{:0>64}",
            uuid::Uuid::new_v4().simple()
        );
        for name in [&other, &portable] {
            let mut target: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
            unsafe {
                let mut c: CREDENTIALW = std::mem::zeroed();
                c.Type = CRED_TYPE_GENERIC;
                c.TargetName = target.as_mut_ptr();
                c.Persist = CRED_PERSIST_LOCAL_MACHINE;
                assert_ne!(CredWriteW(&c, 0), 0);
            }
        }
        super::clear_installed().unwrap();
        assert!(super::read(&host, 22, "fixture").is_err());
        for name in [&other, &portable] {
            let target: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
            unsafe {
                let mut credential = std::ptr::null_mut();
                assert_ne!(
                    CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential),
                    0
                );
                CredFree(credential.cast());
                assert_ne!(CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0), 0);
            }
        }
    }
}
