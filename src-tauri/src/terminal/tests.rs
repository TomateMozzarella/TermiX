use super::*;
use std::time::Instant;

fn default_profile() -> &'static str {
    if cfg!(windows) {
        "cmd"
    } else {
        "sh"
    }
}

pub(super) fn open(manager: &TerminalManager, profile: &str, cols: u16, rows: u16) -> String {
    let id = manager.open(profile, cols, rows).unwrap();
    #[cfg(windows)]
    {
        // ConPTY inherits cursor position and requests a DSR response. In the
        // app xterm supplies it; this headless integration client must too.
        let session = manager.get(&id).unwrap();
        until(&session, "\x1b[6n");
        session.write(b"\x1b[1;1R").unwrap();
    }
    id
}

pub(super) fn until(session: &TerminalSession, needle: &str) -> Vec<u8> {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut bytes = Vec::new();
    while Instant::now() < deadline {
        match session.read().unwrap() {
            Output::Data { bytes: chunk } => bytes.extend(chunk),
            Output::Error { message } => panic!("{message}"),
            Output::Exit { .. } => panic!("Shell exited before expected output"),
            _ => {}
        }
        if String::from_utf8_lossy(&bytes).contains(needle) {
            return bytes;
        }
        assert!(bytes.len() < 1024 * 1024, "Unexpected output flood");
    }
    panic!("PTY output timed out waiting for {needle}");
}

#[test]
fn interactive_shell_resize_independent_tabs_close_and_reopen() {
    let manager = TerminalManager::default();
    let first = open(&manager, default_profile(), 80, 24);
    let second = open(&manager, default_profile(), 80, 24);
    let a = manager.get(&first).unwrap();
    let b = manager.get(&second).unwrap();
    a.resize(120, 35).unwrap();
    assert_eq!(
        a.master
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .get_size()
            .unwrap()
            .cols,
        120
    );
    assert_eq!(
        b.master
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .get_size()
            .unwrap()
            .cols,
        80
    );
    if cfg!(windows) {
        a.write(b"set TERMIX_TEST=one\r").unwrap();
        a.write(b"echo %TERMIX_TEST%-marker\r").unwrap();
    } else {
        a.write(b"TERMIX_TEST=one\r").unwrap();
        a.write(b"echo ${TERMIX_TEST}-marker\r").unwrap();
    }
    until(&a, "one-marker");
    // Prompt/echo cannot satisfy this: marker is assembled by the shell.
    b.write(b"echo second\"-tab\"\r").unwrap();
    #[cfg(not(windows))]
    until(&b, "second-tab");
    #[cfg(windows)]
    {
        b.write(b"set TERMIX_TEST=two\r").unwrap();
        b.write(b"echo %TERMIX_TEST%-marker\r").unwrap();
        until(&b, "two-marker");
    }
    manager.close(&first).unwrap();
    manager.close(&first).unwrap();
    assert!(manager.get(&first).is_err());
    assert!(a.write(b"x").is_err());
    manager.close(&second).unwrap();
    let reopened = open(&manager, default_profile(), 80, 24);
    assert_ne!(first, reopened);
    manager.close_all();
    assert!(manager.get(&reopened).is_err());
}

#[test]
fn rejects_unknown_profiles_invalid_sizes_and_oversized_input() {
    let manager = TerminalManager::default();
    assert!(manager.open("cmd /c injected", 80, 24).is_err());
    assert!(manager.open(default_profile(), 0, 24).is_err());
    assert!(manager.get("missing").is_err());
    let id = open(&manager, default_profile(), 80, 24);
    let session = manager.get(&id).unwrap();
    assert!(session.write(&vec![0; MAX_INPUT + 1]).is_err());
    assert!(session.resize(501, 24).is_err());
    manager.close(&id).unwrap();
}

#[test]
fn natural_exit_is_reported_and_output_is_drained() {
    let manager = TerminalManager::default();
    let id = open(&manager, default_profile(), 80, 24);
    let session = manager.get(&id).unwrap();
    session.write(b"echo before-exit\rexit 7\r").unwrap();
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut output = Vec::new();
    loop {
        assert!(Instant::now() < deadline, "Shell exit timed out");
        match session.read().unwrap() {
            Output::Data { bytes } => output.extend(bytes),
            Output::Exit { code } => {
                assert_eq!(code, Some(7));
                break;
            }
            _ => {}
        }
    }
    assert!(String::from_utf8_lossy(&output).contains("before-exit"));
    manager.close(&id).unwrap();
}

#[cfg(windows)]
#[test]
fn powershell_unicode_interactive_input_and_control_c() {
    let manager = TerminalManager::default();
    let id = open(&manager, "powershell", 80, 24);
    let session = manager.get(&id).unwrap();
    session
        .write("[Console]::WriteLine([string][char]0x00F6 + 'unicode-marker')\r".as_bytes())
        .unwrap();
    until(&session, "öunicode-marker");
    session
        .write(b"$answer = Read-Host 'INPUT_READY'; [Console]::WriteLine('answer=' + $answer)\r")
        .unwrap();
    until(&session, "INPUT_READY");
    // Wait for the command's Read-Host prompt rather than the echoed source line.
    std::thread::sleep(Duration::from_millis(500));
    session.write(b"hello\r").unwrap();
    until(&session, "answer=hello");
    session.write(b"Start-Sleep -Seconds 30\r").unwrap();
    std::thread::sleep(Duration::from_millis(300));
    session.write(&[3]).unwrap();
    session
        .write(b"[Console]::WriteLine('after-' + 'interrupt')\r")
        .unwrap();
    until(&session, "after-interrupt");
    manager.close(&id).unwrap();
}
