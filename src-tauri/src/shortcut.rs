use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

pub fn launch_session() -> Option<String> {
    let mut args = std::env::args_os().skip(1);
    if args.next()?.to_str()? != "--open-session" {
        return None;
    }
    let token = args.next()?;
    let token = token.to_str()?;
    if token.len() > 172 || args.next().is_some() {
        return None;
    }
    let id = String::from_utf8(URL_SAFE_NO_PAD.decode(token).ok()?).ok()?;
    (!id.is_empty() && id.len() <= 128 && !id.chars().any(char::is_control)).then_some(id)
}

#[cfg(windows)]
pub fn create(id: &str, name: &str) -> Result<(), String> {
    use std::{
        ffi::{OsStr, OsString},
        os::windows::ffi::{OsStrExt, OsStringExt},
        path::PathBuf,
    };
    use windows::{
        core::{Interface, PCWSTR},
        Win32::{
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{
                FOLDERID_Desktop, IShellLinkW, SHGetKnownFolderPath, ShellLink, KNOWN_FOLDER_FLAG,
            },
        },
    };
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    fn wide(value: &OsStr) -> Vec<u16> {
        value.encode_wide().chain(std::iter::once(0)).collect()
    }
    let executable = std::env::current_exe().map_err(|_| "shortcut_failed")?;
    let stem: String = name
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
        .take(48)
        .collect();
    let arguments = wide(OsStr::new(&format!(
        "--open-session {}",
        URL_SAFE_NO_PAD.encode(id)
    )));
    let executable = wide(executable.as_os_str());
    // SAFETY: COM lives on this worker thread, and the UTF-16 buffers are terminated and
    // kept alive for their respective calls. The Windows desktop path is freed after copying.
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|_| "shortcut_failed")?;
        let _apartment = Apartment;
        let desktop = SHGetKnownFolderPath(&FOLDERID_Desktop, KNOWN_FOLDER_FLAG(0), None)
            .map_err(|_| "shortcut_failed")?;
        let path = PathBuf::from(OsString::from_wide(desktop.as_wide()));
        CoTaskMemFree(Some(desktop.0.cast()));
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|_| "shortcut_failed")?;
        link.SetPath(PCWSTR(executable.as_ptr()))
            .map_err(|_| "shortcut_failed")?;
        link.SetArguments(PCWSTR(arguments.as_ptr()))
            .map_err(|_| "shortcut_failed")?;
        let file: IPersistFile = link.cast().map_err(|_| "shortcut_failed")?;
        let key = uuid::Uuid::new_v4().simple().to_string();
        let candidate = path.join(format!("TermiX - {} ({}).lnk", stem.trim(), &key[..8]));
        drop(
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&candidate)
                .map_err(|_| "shortcut_failed")?,
        );
        let target = wide(candidate.as_os_str());
        if file.Save(PCWSTR(target.as_ptr()), true).is_err() {
            let _ = std::fs::remove_file(candidate);
            return Err("shortcut_failed".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn create(_id: &str, _name: &str) -> Result<(), String> {
    Err("shortcut_failed".into())
}
