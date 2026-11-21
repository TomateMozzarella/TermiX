use std::path::PathBuf;

#[derive(Clone)]
pub enum Choice {
    Editor,
    Import,
    Export,
    ImportCommands,
    ExportCommands,
    Upload,
    UploadFolder,
    Download {
        name: String,
        directory: Option<PathBuf>,
    },
}

pub async fn choose(
    window: tauri::WebviewWindow,
    choice: Choice,
) -> Result<Option<PathBuf>, String> {
    #[cfg(windows)]
    {
        let owner = window.hwnd().map_err(|_| "file_dialog_failed")?.0 as usize;
        let (tx, rx) = tokio::sync::oneshot::channel();
        window
            .run_on_main_thread(move || {
                let _ = tx.send(show(owner, choice));
            })
            .map_err(|_| "file_dialog_failed")?;
        rx.await.map_err(|_| "file_dialog_failed".to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (window, choice);
        Err("file_dialog_unavailable".into())
    }
}

#[cfg(windows)]
fn show(owner: usize, choice: Choice) -> Result<Option<PathBuf>, String> {
    if matches!(choice, Choice::UploadFolder) {
        return folder(owner);
    }
    use windows_sys::Win32::UI::Controls::Dialogs::*;
    let filter = match choice {
        Choice::Editor => "Windows executable (*.exe)\0*.exe\0\0",
        Choice::Upload | Choice::Download { .. } => "All files (*.*)\0*.*\0\0",
        Choice::ImportCommands | Choice::ExportCommands => "TermiX commands (*.json)\0*.json\0\0",
        _ => "TermiX sessions (*.json)\0*.json\0\0",
    }
    .encode_utf16()
    .collect::<Vec<_>>();
    let extension = "json\0".encode_utf16().collect::<Vec<_>>();
    let mut filename = vec![0u16; 32768];
    if matches!(choice, Choice::Export | Choice::ExportCommands) {
        let name = if matches!(choice, Choice::ExportCommands) {
            "TermiX-commands.json"
        } else {
            "TermiX-sessions.json"
        };
        for (i, unit) in name.encode_utf16().enumerate() {
            filename[i] = unit;
        }
    }
    let mut initial_directory = Vec::new();
    if let Choice::Download { name, directory } = &choice {
        use std::os::windows::ffi::OsStrExt;
        if let Some(path) = directory {
            initial_directory.extend(path.as_os_str().encode_wide());
            initial_directory.push(0);
        }
        let name = if name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
            || name.ends_with(['.', ' '])
            || name.is_empty()
        {
            "download"
        } else {
            name
        };
        for (i, unit) in name.encode_utf16().take(filename.len() - 1).enumerate() {
            filename[i] = unit;
        }
    }
    // SAFETY: all UTF-16 buffers live throughout the modal call. Only the path
    // explicitly chosen in the owner-bound Windows dialog is returned.
    unsafe {
        let mut options: OPENFILENAMEW = std::mem::zeroed();
        options.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        options.hwndOwner = owner as _;
        options.lpstrFilter = filter.as_ptr();
        options.lpstrFile = filename.as_mut_ptr();
        options.nMaxFile = filename.len() as u32;
        options.nFilterIndex = 1;
        if !initial_directory.is_empty() {
            options.lpstrInitialDir = initial_directory.as_ptr();
        }
        options.Flags = OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST | OFN_DONTADDTORECENT;
        let result = if matches!(
            choice,
            Choice::Export | Choice::ExportCommands | Choice::Download { .. }
        ) {
            options.Flags |= OFN_OVERWRITEPROMPT;
            if matches!(choice, Choice::Export | Choice::ExportCommands) {
                options.lpstrDefExt = extension.as_ptr();
            }
            GetSaveFileNameW(&mut options)
        } else {
            options.Flags |= OFN_FILEMUSTEXIST;
            GetOpenFileNameW(&mut options)
        };
        if result == 0 {
            return if CommDlgExtendedError() == 0 {
                Ok(None)
            } else {
                Err("file_dialog_failed".into())
            };
        }
    }
    let length = filename
        .iter()
        .position(|c| *c == 0)
        .ok_or("file_dialog_failed")?;
    let path =
        PathBuf::from(String::from_utf16(&filename[..length]).map_err(|_| "file_dialog_failed")?);
    if !path.is_absolute() {
        return Err("file_dialog_failed".into());
    }
    let expected = if matches!(choice, Choice::Editor) {
        "exe"
    } else {
        "json"
    };
    if !matches!(choice, Choice::Upload | Choice::Download { .. })
        && !path
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case(expected))
    {
        return Err("file_type_invalid".into());
    }
    Ok(Some(path))
}
#[cfg(windows)]
fn folder(owner: usize) -> Result<Option<PathBuf>, String> {
    use windows_sys::Win32::{System::Com::*, UI::Shell::*};
    // Owner-bound shell folder picker, running on the existing STA UI thread.
    unsafe {
        let result = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        if result < 0 {
            return Err("file_dialog_failed".into());
        }
        struct Com;
        impl Drop for Com {
            fn drop(&mut self) {
                unsafe {
                    CoUninitialize();
                }
            }
        }
        let _com = Com;
        let mut display = vec![0u16; 32768];
        let title = "TermiX · SFTP\0".encode_utf16().collect::<Vec<_>>();
        let mut info: BROWSEINFOW = std::mem::zeroed();
        info.hwndOwner = owner as _;
        info.pszDisplayName = display.as_mut_ptr();
        info.lpszTitle = title.as_ptr();
        info.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX;
        let selected = SHBrowseForFolderW(&info);
        if selected.is_null() {
            return Ok(None);
        }
        let mut buffer = vec![0u16; 32768];
        let ok = SHGetPathFromIDListEx(
            selected,
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            GPFIDL_DEFAULT,
        );
        CoTaskMemFree(selected.cast());
        if ok == 0 {
            return Err("file_dialog_failed".into());
        }
        let len = buffer
            .iter()
            .position(|c| *c == 0)
            .ok_or("file_dialog_failed")?;
        let path =
            PathBuf::from(String::from_utf16(&buffer[..len]).map_err(|_| "file_dialog_failed")?);
        if !path.is_absolute() {
            return Err("file_dialog_failed".into());
        }
        Ok(Some(path))
    }
}
