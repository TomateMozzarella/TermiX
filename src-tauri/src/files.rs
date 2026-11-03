use std::path::PathBuf;

#[derive(Clone, Copy)]
pub enum Choice {
    Editor,
    Import,
    Export,
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
    use windows_sys::Win32::UI::Controls::Dialogs::*;
    let filter = match choice {
        Choice::Editor => "Windows executable (*.exe)\0*.exe\0\0",
        _ => "TermiX sessions (*.json)\0*.json\0\0",
    }
    .encode_utf16()
    .collect::<Vec<_>>();
    let extension = "json\0".encode_utf16().collect::<Vec<_>>();
    let mut filename = vec![0u16; 32768];
    if matches!(choice, Choice::Export) {
        for (i, unit) in "TermiX-sessions.json".encode_utf16().enumerate() {
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
        options.Flags = OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST | OFN_DONTADDTORECENT;
        let result = if matches!(choice, Choice::Export) {
            options.Flags |= OFN_OVERWRITEPROMPT;
            options.lpstrDefExt = extension.as_ptr();
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
    if !path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case(expected))
    {
        return Err("file_type_invalid".into());
    }
    Ok(Some(path))
}
