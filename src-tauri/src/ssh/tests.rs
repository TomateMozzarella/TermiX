use super::*;
fn directory() -> PathBuf {
    let path = std::env::temp_dir().join(format!("termix-ssh-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&path).unwrap();
    path
}
fn fixture() -> Option<(u16, PathBuf)> {
    if std::env::var_os("TERMIX_SSH_TEST_DIR").is_none() {
        assert!(
            std::env::var_os("CI").is_none(),
            "CI must run the SSH fixture"
        );
        return None;
    }
    Some((
        std::env::var("TERMIX_SSH_TEST_PORT")
            .unwrap_or_else(|_| "22222".into())
            .parse()
            .unwrap(),
        PathBuf::from(std::env::var_os("TERMIX_SSH_TEST_DIR").unwrap()),
    ))
}
fn auth(method: &str, username: &str) -> Auth {
    Auth {
        username: username.into(),
        method: method.into(),
        password: "termix-test-password".into(),
        key_path: String::new(),
        passphrase: String::new(),
        save_password: false,
    }
}
fn receive(session: &SshTerminal, needle: &str) -> Vec<u8> {
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut output = Vec::new();
    while Instant::now() < deadline {
        match session.read().unwrap() {
            Output::Data { bytes } => output.extend(bytes),
            Output::Exit { .. } => panic!("Unexpected EOF"),
            _ => {}
        }
        assert!(output.len() < 1024 * 1024);
        if String::from_utf8_lossy(&output).contains(needle) {
            return output;
        }
    }
    panic!("SSH output timeout");
}
#[test]
fn rejects_invalid_endpoints_and_dimensions() {
    for host in ["", "-oProxyCommand=bad", "a b", "a/b", "host\n"] {
        assert!(validate_endpoint(host, 22).is_err());
    }
    assert!(validate_endpoint("localhost", 0).is_err());
    assert_eq!(validate_endpoint("[::1]", 22).unwrap(), "::1");
    assert!(size(0, 24).is_err());
    assert!(size(80, 501).is_err());
    assert!(validate_username("a\n").is_err());
}
#[test]
fn host_verification_precedes_authentication_and_changed_keys_block() {
    let Some((port, fixture)) = fixture() else {
        return;
    };
    let dir = directory();
    let manager = SshManager::new(dir.join("known-hosts.json"));
    let user = format!("verification-{}", uuid::Uuid::new_v4());
    let first = manager.probe("127.0.0.1", port).unwrap();
    assert_eq!(first.status, "unknown");
    assert!(manager
        .open(&first.ticket, "known", "", auth("password", &user), 80, 24)
        .is_err());
    let events = std::fs::read_to_string(fixture.join("events.jsonl")).unwrap_or_default();
    assert!(!events.contains(&user));
    let first = manager.probe("127.0.0.1", port).unwrap();
    let id = manager
        .open(&first.ticket, "trust", "", auth("password", &user), 80, 24)
        .unwrap();
    manager.close(&id);
    let known = manager.probe("127.0.0.1", port).unwrap();
    assert_eq!(known.status, "known");
    manager.cancel(&known.ticket);
    let mut pins = manager.pins().unwrap();
    let pin = pins.values_mut().next().unwrap();
    pin.key = "changed-test-key".into();
    pin.fingerprint = "SHA256:previous-test-key".into();
    crate::atomic::write(&manager.pins_path, &serde_json::to_vec(&pins).unwrap()).unwrap();
    let changed = manager.probe("127.0.0.1", port).unwrap();
    assert_eq!(changed.status, "changed");
    assert_ne!(
        changed.previous_fingerprint.as_ref(),
        Some(&changed.fingerprint)
    );
    assert!(manager
        .open(
            &changed.ticket,
            "trust",
            "",
            auth("password", "blocked"),
            80,
            24
        )
        .is_err());
    let changed = manager.probe("127.0.0.1", port).unwrap();
    assert!(manager
        .open(
            &changed.ticket,
            "replace",
            "wrong-host",
            auth("password", "blocked"),
            80,
            24
        )
        .is_err());
    let changed = manager.probe("127.0.0.1", port).unwrap();
    let id = manager
        .open(
            &changed.ticket,
            "replace",
            "127.0.0.1",
            auth("password", &user),
            80,
            24,
        )
        .unwrap();
    manager.close(&id);
    let stored = std::fs::read_to_string(&manager.pins_path).unwrap();
    assert!(!stored.contains("termix-test-password"));
    assert!(!stored.contains("PRIVATE KEY"));
    assert!(!std::fs::read_to_string(fixture.join("events.jsonl"))
        .unwrap()
        .contains("blocked"));
    manager.close_all();
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn real_ssh_password_unicode_interactive_input_resize_exit_and_reconnect() {
    let Some((port, _)) = fixture() else {
        return;
    };
    let dir = directory();
    let manager = SshManager::new(dir.join("known-hosts.json"));
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let id = manager
        .open(
            &probe.ticket,
            "trust",
            "",
            auth("password", "terminal"),
            80,
            24,
        )
        .unwrap();
    let terminal = manager.get(&id).unwrap();
    receive(&terminal, "ö");
    terminal.write("hello-ö\r".as_bytes()).unwrap();
    receive(&terminal, "remote:hello-ö");
    terminal.resize(120, 40).unwrap();
    receive(&terminal, "size:120:40");
    terminal.write(&[3]).unwrap();
    receive(&terminal, "^C");
    assert!(terminal.write(&vec![0; 65537]).is_err());
    terminal.write(b"exit\r").unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        assert!(Instant::now() < deadline);
        if let Output::Exit { code } = terminal.read().unwrap() {
            assert_eq!(code, Some(7));
            break;
        }
    }
    manager.close(&id);
    assert!(manager.get(&id).is_err());
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let next = manager
        .open(
            &probe.ticket,
            "known",
            "",
            auth("password", "terminal"),
            80,
            24,
        )
        .unwrap();
    assert_ne!(id, next);
    manager.close_all();
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn encrypted_key_auth_and_rejected_password_and_expired_ticket() {
    let Some((port, fixture)) = fixture() else {
        return;
    };
    let dir = directory();
    let manager = SshManager::new(dir.join("known-hosts.json"));
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let mut key = auth("key", "key-user");
    key.key_path = fixture.join("user-key.pem").to_string_lossy().into();
    key.passphrase = "fixture-only".into();
    let id = manager
        .open(&probe.ticket, "trust", "", key, 80, 24)
        .unwrap();
    receive(&manager.get(&id).unwrap(), "fixture ready");
    manager.close(&id);
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let mut key = auth("key", "openssh-ed25519-user");
    key.key_path = fixture
        .join("encrypted-openssh-key")
        .to_string_lossy()
        .into();
    key.passphrase = "fixture-only".into();
    let id = manager
        .open(&probe.ticket, "known", "", key, 80, 24)
        .unwrap();
    receive(&manager.get(&id).unwrap(), "fixture ready");
    manager.close(&id);
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let mut wrong = auth("password", "wrong");
    wrong.password = "wrong-test-only".into();
    assert_eq!(
        manager
            .open(&probe.ticket, "known", "", wrong, 80, 24)
            .unwrap_err(),
        "ssh_auth_failed"
    );
    let probe = manager.probe("127.0.0.1", port).unwrap();
    manager
        .pending
        .lock()
        .unwrap()
        .get_mut(&probe.ticket)
        .unwrap()
        .expires = Instant::now() - Duration::from_secs(1);
    assert_eq!(
        manager
            .open(
                &probe.ticket,
                "known",
                "",
                auth("password", "expired"),
                80,
                24
            )
            .unwrap_err(),
        "ssh_ticket_expired"
    );
    std::fs::write(&manager.pins_path, b"corrupt").unwrap();
    assert!(manager.probe("127.0.0.1", port).is_err());
    assert_eq!(std::fs::read(&manager.pins_path).unwrap(), b"corrupt");
    manager.close_all();
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(windows)]
#[test]
fn native_windows_agent_authentication() {
    let Some((port, _)) = fixture() else {
        return;
    };
    assert_eq!(
        std::env::var("TERMIX_SSH_AGENT_TEST").unwrap_or_default(),
        "1",
        "CI must prepare its isolated SSH agent"
    );
    let dir = directory();
    let manager = SshManager::new(dir.join("known-hosts.json"));
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let id = manager
        .open(
            &probe.ticket,
            "trust",
            "",
            auth("agent", "agent-user"),
            80,
            24,
        )
        .unwrap();
    receive(&manager.get(&id).unwrap(), "fixture ready");
    manager.close(&id);
    manager.close_all();
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(windows)]
#[test]
fn optional_saved_password_stays_in_os_vault_and_is_reused_in_rust() {
    let Some((port, _)) = fixture() else {
        return;
    };
    let dir = directory();
    let manager = SshManager::new(dir.join("known-hosts.json"));
    let username = format!("vault-{}", uuid::Uuid::new_v4());
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let mut password = auth("password", &username);
    password.save_password = true;
    let id = manager
        .open(&probe.ticket, "trust", "", password, 80, 24)
        .unwrap();
    manager.close(&id);
    assert_eq!(
        &**crate::vault::read("127.0.0.1", port, &username).unwrap(),
        "termix-test-password"
    );
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let mut stored = auth("stored", &username);
    stored.password.clear();
    let id = manager
        .open(&probe.ticket, "known", "", stored, 80, 24)
        .unwrap();
    receive(&manager.get(&id).unwrap(), "fixture ready");
    manager.close(&id);
    crate::vault::delete("127.0.0.1", port, &username).unwrap();
    assert!(!std::fs::read_to_string(&manager.pins_path)
        .unwrap()
        .contains("termix-test-password"));
    manager.close_all();
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn sftp_listing_streaming_transfers_overwrite_and_cancel() {
    let Some((port, _fixture)) = fixture() else {
        return;
    };
    let dir = directory();
    let manager = SshManager::new(dir.join("known-hosts.json"));
    let probe = manager.probe("127.0.0.1", port).unwrap();
    let id = manager
        .open(
            &probe.ticket,
            "trust",
            "",
            auth("password", "sftp-test"),
            80,
            24,
        )
        .unwrap();
    let terminal = manager.get(&id).unwrap();
    let listing = crate::sftp::list(&terminal, ".").unwrap();
    assert!(listing
        .entries
        .iter()
        .any(|e| e.name == "hello.txt" && !e.directory));
    assert!(listing
        .entries
        .iter()
        .any(|e| e.name == "folder" && e.directory));
    fn finish(terminal: &SshTerminal) -> crate::sftp::Progress {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let p = crate::sftp::progress(terminal).unwrap().unwrap();
            if p.state != "running" {
                return p;
            }
            assert!(Instant::now() < deadline, "Transfer stalled");
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    let downloaded = dir.join("download.txt");
    crate::sftp::start(
        Arc::clone(&terminal),
        "/hello.txt".into(),
        downloaded.clone(),
        false,
        false,
    )
    .unwrap();
    assert_eq!(finish(&terminal).state, "done");
    assert_eq!(std::fs::read(&downloaded).unwrap(), b"fixture content");
    let upload = dir.join("upload.txt");
    std::fs::write(&upload, b"new bytes").unwrap();
    let remote = format!("/test-{}.txt", uuid::Uuid::new_v4());
    crate::sftp::start(
        Arc::clone(&terminal),
        remote.clone(),
        upload.clone(),
        true,
        false,
    )
    .unwrap();
    let p = finish(&terminal);
    assert_eq!(p.state, "done", "{:?}", p.error);
    crate::sftp::start(
        Arc::clone(&terminal),
        remote.clone(),
        upload.clone(),
        true,
        false,
    )
    .unwrap();
    assert_eq!(finish(&terminal).error.as_deref(), Some("sftp_exists"));
    std::fs::write(&upload, b"replacement").unwrap();
    crate::sftp::start(
        Arc::clone(&terminal),
        remote.clone(),
        upload.clone(),
        true,
        true,
    )
    .unwrap();
    let replacement = finish(&terminal);
    // Servers without atomic overwrite must preserve the original.
    assert!(replacement.state == "done" || replacement.error.as_deref() == Some("sftp_failed"));
    let expected = if replacement.state == "done" {
        b"replacement".as_slice()
    } else {
        b"new bytes".as_slice()
    };
    crate::sftp::start(
        Arc::clone(&terminal),
        remote,
        downloaded.clone(),
        false,
        false,
    )
    .unwrap();
    assert_eq!(finish(&terminal).state, "done");
    assert_eq!(std::fs::read(downloaded).unwrap(), expected);
    let target = dir.join("cancel.bin");
    std::fs::write(&target, b"preserve").unwrap();
    let task = crate::sftp::start(
        Arc::clone(&terminal),
        "/large.bin".into(),
        target.clone(),
        false,
        false,
    )
    .unwrap();
    crate::sftp::cancel(&terminal, &task);
    assert_eq!(finish(&terminal).state, "cancelled");
    assert_eq!(std::fs::read(target).unwrap(), b"preserve");
    terminal.write(b"still-live\r").unwrap();
    receive(&terminal, "remote:still-live");
    manager.close(&id);
}
