use super::tests::{open, until};
use super::*;
use std::time::Instant;

#[test]
fn closing_a_backpressured_terminal_does_not_deadlock() {
    let manager = Arc::new(TerminalManager::default());
    let id = open(&manager, "powershell", 80, 24);
    let session = manager.get(&id).unwrap();
    session
        .write(b"while ($true) { [Console]::WriteLine('x' * 4096) }\r")
        .unwrap();
    std::thread::sleep(Duration::from_millis(700));
    let (done, wait) = mpsc::channel();
    std::thread::spawn(move || {
        manager.close(&id).unwrap();
        done.send(()).unwrap();
    });
    wait.recv_timeout(Duration::from_secs(10))
        .expect("Closing a full PTY output queue deadlocked");
    assert!(session.write(b"x").is_err());
}

#[test]
fn windows_job_terminates_shell_descendants() {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, WaitForSingleObject},
    };
    let manager = TerminalManager::default();
    let id = open(&manager, "powershell", 160, 30);
    let session = manager.get(&id).unwrap();
    session.write(b"$p = Start-Process ($env:SystemRoot + '\\System32\\cmd.exe') -ArgumentList '/D /C ping -n 120 127.0.0.1 >nul' -PassThru -WindowStyle Hidden; [Console]::WriteLine('PIDBEGIN' + $p.Id + 'PIDEND')\r").unwrap();
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut output = Vec::new();
    let pid = loop {
        assert!(Instant::now() < deadline, "Descendant PID not received");
        output.extend(until(&session, "PIDEND"));
        let text = String::from_utf8_lossy(&output);
        if let Some(pid) = text.split("PIDBEGIN").skip(1).find_map(|part| {
            let (digits, _) = part.split_once("PIDEND")?;
            digits.parse::<u32>().ok()
        }) {
            break pid;
        }
    };
    // SAFETY: only SYNCHRONIZE access is requested. The live handle is closed
    // before asserting the wait result, even if cleanup fails.
    unsafe {
        let handle = OpenProcess(0x00100000, 0, pid);
        assert!(!handle.is_null(), "Cannot inspect spawned descendant");
        manager.close_all();
        let result = WaitForSingleObject(handle, 10000);
        CloseHandle(handle);
        assert_eq!(result, 0, "Shell descendant survived terminal close");
    }
}
