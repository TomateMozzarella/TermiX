use zeroize::Zeroizing;

fn target(host: &str, port: u16, username: &str) -> Vec<u16> {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(format!("{host}\0{port}\0{username}").as_bytes());
    let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
    format!("TermiX:ssh:{hex}")
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
