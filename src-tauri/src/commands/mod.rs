use crate::terminal::{Output, ShellProfile, TerminalManager};
use crate::{error::AppError, models::Session, AppState};
use tauri::State;

#[tauri::command]
pub fn get_preferences(
    state: State<'_, AppState>,
) -> Result<Option<crate::preferences::Preferences>, String> {
    state
        .preferences
        .lock()
        .map_err(|_| "Einstellungen sind nicht verfügbar.")?
        .read()
}

#[tauri::command]
pub fn save_preferences(
    state: State<'_, AppState>,
    preferences: crate::preferences::Preferences,
) -> Result<crate::preferences::Preferences, String> {
    state
        .preferences
        .lock()
        .map_err(|_| "Einstellungen sind nicht verfügbar.")?
        .save(preferences)
}

#[tauri::command]
pub fn terminal_profiles() -> Vec<ShellProfile> {
    crate::terminal::profiles()
}

// Blocking PTY operations run on the blocking pool, never the UI thread.
#[tauri::command]
pub async fn open_terminal(
    profile: String,
    cols: u16,
    rows: u16,
    app: tauri::AppHandle,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<TerminalManager>().open(&profile, cols, rows)
    })
    .await
    .map_err(|_| "PTY startup worker failed".to_string())?
}

#[tauri::command]
pub async fn read_terminal(
    ssh: State<'_, crate::ssh::SshManager>,
    state: State<'_, TerminalManager>,
    id: String,
) -> Result<Output, String> {
    if id.starts_with("ssh-") {
        let session = ssh.get(&id)?;
        return tauri::async_runtime::spawn_blocking(move || session.read())
            .await
            .map_err(|_| "ssh_failed".to_string())?;
    }
    let session = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || session.read())
        .await
        .map_err(|_| "PTY read worker failed".to_string())?
}

#[tauri::command]
pub async fn write_terminal(
    ssh: State<'_, crate::ssh::SshManager>,
    state: State<'_, TerminalManager>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    if id.starts_with("ssh-") {
        return ssh.get(&id)?.write(&data);
    }
    let session = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || session.write(&data))
        .await
        .map_err(|_| "PTY write worker failed".to_string())?
}

#[tauri::command]
pub async fn resize_terminal(
    ssh: State<'_, crate::ssh::SshManager>,
    state: State<'_, TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if id.starts_with("ssh-") {
        return ssh.get(&id)?.resize(cols, rows);
    }
    let session = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || session.resize(cols, rows))
        .await
        .map_err(|_| "PTY resize worker failed".to_string())?
}

#[tauri::command]
pub async fn close_terminal(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if id.starts_with("ssh-") {
        use tauri::Manager;
        app.state::<crate::ssh::SshManager>().close(&id);
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<TerminalManager>().close(&id)
    })
    .await
    .map_err(|_| "PTY close worker failed".to_string())?
}

#[tauri::command]
pub async fn ssh_probe(
    app: tauri::AppHandle,
    host: String,
    port: u16,
) -> Result<crate::ssh::Probe, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<crate::ssh::SshManager>().probe(&host, port)
    })
    .await
    .map_err(|_| "ssh_failed".to_string())?
}
#[tauri::command]
pub fn ssh_cancel(state: State<'_, crate::ssh::SshManager>, ticket: String) {
    state.cancel(&ticket);
}
#[tauri::command]
pub async fn ssh_open(
    app: tauri::AppHandle,
    ticket: String,
    decision: String,
    confirmation: String,
    auth: crate::ssh::Auth,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<crate::ssh::SshManager>().open(
            &ticket,
            &decision,
            &confirmation,
            auth,
            cols,
            rows,
        )
    })
    .await
    .map_err(|_| "ssh_failed".to_string())?
}
#[tauri::command]
pub async fn ssh_forget_password(host: String, port: u16, username: String) -> Result<(), String> {
    let host = crate::ssh::validate_endpoint(&host, port)?;
    tauri::async_runtime::spawn_blocking(move || crate::vault::delete(&host, port, &username))
        .await
        .map_err(|_| "vault_failed".to_string())?
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, AppError> {
    let store = state.sessions.lock().map_err(|_| AppError::LockPoisoned)?;
    Ok(store.all())
}

#[tauri::command]
pub fn save_session(state: State<'_, AppState>, session: Session) -> Result<Session, AppError> {
    let mut store = state.sessions.lock().map_err(|_| AppError::LockPoisoned)?;
    store.upsert(session)
}

#[tauri::command]
pub fn delete_session(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let mut store = state.sessions.lock().map_err(|_| AppError::LockPoisoned)?;
    store.delete(&id)
}

#[tauri::command]
pub fn get_catalog(state: State<'_, AppState>) -> Result<crate::models::Catalog, AppError> {
    Ok(state
        .sessions
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .catalog())
}
#[tauri::command]
pub fn reload_catalog(state: State<'_, AppState>) -> Result<crate::models::Catalog, AppError> {
    state
        .sessions
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .reload()
}
#[tauri::command]
pub fn save_folder(
    state: State<'_, AppState>,
    folder: crate::models::Folder,
) -> Result<crate::models::Catalog, AppError> {
    state
        .sessions
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .save_folder(folder)
}
#[tauri::command]
pub fn delete_folder(
    state: State<'_, AppState>,
    id: String,
) -> Result<crate::models::Catalog, AppError> {
    state
        .sessions
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .delete_folder(&id)
}
#[tauri::command]
pub fn touch_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<crate::models::Catalog, AppError> {
    state
        .sessions
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .touch(&id)
}
#[tauri::command]
pub async fn pick_session_import(
    window: tauri::WebviewWindow,
) -> Result<Option<crate::models::Catalog>, String> {
    let Some(path) = crate::files::choose(window, crate::files::Choice::Import).await? else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || {
        crate::storage::SessionStore::read_import(&path)
            .map(Some)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "session_import_failed".to_string())?
}
#[tauri::command]
pub fn import_sessions(
    state: State<'_, AppState>,
    catalog: crate::models::Catalog,
) -> Result<crate::models::Catalog, AppError> {
    state
        .sessions
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .import(catalog)
}
#[tauri::command]
pub async fn export_sessions(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    session_id: Option<String>,
    folder_id: Option<String>,
) -> Result<bool, String> {
    let bytes = {
        let store = state.sessions.lock().map_err(|_| "session_save_failed")?;
        if let Some(id) = session_id.or(folder_id.clone()) {
            let mut catalog = store.catalog();
            if folder_id.is_some() {
                catalog.sessions.retain(|session| session.group == id);
                catalog.folders.retain(|folder| folder.id == id);
            } else {
                catalog.sessions.retain(|session| session.id == id);
                catalog.folders.retain(|folder| {
                    catalog
                        .sessions
                        .iter()
                        .any(|session| session.group == folder.id)
                });
            }
            serde_json::to_vec_pretty(&catalog).map_err(|_| "session_export_failed")?
        } else {
            store.export().map_err(|e| e.to_string())?
        }
    };
    let Some(path) = crate::files::choose(window, crate::files::Choice::Export).await? else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        crate::atomic::write(&path, &bytes)
            .map(|_| true)
            .map_err(|_| "session_export_failed".into())
    })
    .await
    .map_err(|_| "session_export_failed".to_string())?
}
#[tauri::command]
pub async fn choose_editor(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    let Some(path) = crate::files::choose(window, crate::files::Choice::Editor).await? else {
        return Ok(None);
    };
    let path = path.to_string_lossy().to_string();
    crate::editors::validate_path(&path, true)?;
    Ok(Some(path))
}
#[tauri::command]
pub async fn detect_editor(editor: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::editors::detect(&editor))
        .await
        .map_err(|_| "invalid_editor".to_string())?
}
#[tauri::command]
pub async fn sftp_list(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    path: String,
) -> Result<crate::sftp::Listing, String> {
    let terminal = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || crate::sftp::list(&terminal, &path))
        .await
        .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub fn sftp_progress(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
) -> Result<Option<crate::sftp::Progress>, String> {
    let terminal = state.get(&id)?;
    crate::sftp::progress(&terminal)
}
#[tauri::command]
pub fn sftp_cancel(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    transfer: String,
) -> Result<(), String> {
    let terminal = state.get(&id)?;
    crate::sftp::cancel(&terminal, &transfer);
    Ok(())
}
#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, crate::ssh::SshManager>,
    window: tauri::WebviewWindow,
    id: String,
    directory: String,
    overwrite: bool,
) -> Result<Option<String>, String> {
    let terminal = state.get(&id)?;
    let remote = crate::sftp::path(&directory)?;
    let Some(local) = crate::files::choose(window, crate::files::Choice::Upload).await? else {
        return Ok(None);
    };
    let name = local
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("sftp_path")?;
    let destination = remote
        .join(name)
        .to_str()
        .ok_or("sftp_path")?
        .replace('\\', "/");
    crate::sftp::start(terminal, destination, local, true, overwrite).map(Some)
}
#[tauri::command]
pub async fn sftp_download(
    state: State<'_, crate::ssh::SshManager>,
    window: tauri::WebviewWindow,
    id: String,
    path: String,
) -> Result<Option<String>, String> {
    let terminal = state.get(&id)?;
    crate::sftp::path(&path)?;
    let Some(local) = crate::files::choose(
        window,
        crate::files::Choice::Download(
            crate::sftp::path(&path)?
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or("sftp_path")?
                .to_owned(),
        ),
    )
    .await?
    else {
        return Ok(None);
    };
    crate::sftp::start(terminal, path, local, false, false).map(Some)
}
#[tauri::command]
pub async fn editor_open(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    path: String,
) -> Result<crate::document::View, String> {
    let terminal = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || crate::document::open(&terminal, &path))
        .await
        .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub async fn editor_save(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    token: String,
    text: String,
) -> Result<(), String> {
    let terminal = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || crate::document::save(&terminal, &token, text))
        .await
        .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub fn editor_close(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    token: String,
) -> Result<(), String> {
    {
        let terminal = state.get(&id)?;
        crate::document::close(&terminal, &token)
    }
}
#[tauri::command]
pub async fn editor_external(
    state: State<'_, crate::ssh::SshManager>,
    app: tauri::AppHandle,
    id: String,
    token: String,
) -> Result<String, String> {
    let terminal = state.get(&id)?;
    use tauri::Manager;
    let preferences = app
        .state::<AppState>()
        .preferences
        .lock()
        .map_err(|_| "preferences_invalid")?
        .read()?
        .ok_or("preferences_invalid")?;
    if preferences.editor == "integrated" || preferences.editor_path.is_empty() {
        return Err("invalid_editor".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        crate::document::external(&terminal, &token, preferences.editor_path)
    })
    .await
    .map_err(|_| "editor_launch".to_owned())?
}
#[tauri::command]
pub async fn editor_reload_external(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    token: String,
) -> Result<String, String> {
    let terminal = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::document::reload_external(&terminal, &token)
    })
    .await
    .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    directory: String,
    name: String,
) -> Result<(), String> {
    let terminal = state.get(&id)?;
    if name.is_empty()
        || name.len() > 255
        || name == "."
        || name == ".."
        || name.contains(['/', '\\'])
        || name.chars().any(|c| c.is_control())
    {
        return Err("sftp_path".into());
    }
    let target = crate::sftp::path(&format!("{}/{}", directory.trim_end_matches('/'), name))?;
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = terminal.remote.gate.try_lock().map_err(|_| "sftp_busy")?;
        let subsystem = terminal.remote.subsystem.lock().map_err(|_| "ssh_state")?;
        let sftp = subsystem.as_ref().ok_or("sftp_failed")?;
        crate::sftp::retry(&terminal, None, || sftp.mkdir(&target, 0o700))
    })
    .await
    .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub async fn editor_reload(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    token: String,
) -> Result<crate::document::View, String> {
    let terminal = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || crate::document::reload(&terminal, &token))
        .await
        .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub fn get_workspace(app: tauri::AppHandle) -> Result<Option<crate::workspace::Workspace>, String> {
    use tauri::Manager;
    crate::workspace::read(&crate::app_data::directory(&app)?.join("workspace.json"))
}
#[tauri::command]
pub fn save_workspace(
    app: tauri::AppHandle,
    workspace: crate::workspace::Workspace,
) -> Result<(), String> {
    use tauri::Manager;
    crate::workspace::save(
        &crate::app_data::directory(&app)?.join("workspace.json"),
        workspace,
    )
}
#[tauri::command]
pub fn ui_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|_| "window_unavailable".into())
}
#[tauri::command]
pub fn get_snippets(app: tauri::AppHandle) -> Result<crate::snippets::Library, String> {
    crate::snippets::read(&crate::app_data::directory(&app)?.join("commands.json"))
}
#[tauri::command]
pub fn save_snippets(
    app: tauri::AppHandle,
    library: crate::snippets::Library,
) -> Result<crate::snippets::Library, String> {
    crate::snippets::save(
        &crate::app_data::directory(&app)?.join("commands.json"),
        library,
    )
}
#[tauri::command]
pub async fn pick_snippet_import(
    window: tauri::WebviewWindow,
) -> Result<Option<crate::snippets::Library>, String> {
    let Some(path) = crate::files::choose(window, crate::files::Choice::ImportCommands).await?
    else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || crate::snippets::read_import(&path).map(Some))
        .await
        .map_err(|_| "snippets_invalid".to_string())?
}

#[tauri::command]
pub fn import_snippets(
    app: tauri::AppHandle,
    library: crate::snippets::Library,
) -> Result<crate::snippets::Library, String> {
    crate::snippets::merge(
        &crate::app_data::directory(&app)?.join("commands.json"),
        library,
    )
}

#[tauri::command]
pub async fn export_snippets(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let source = crate::app_data::directory(&app)?.join("commands.json");
    let Some(path) = crate::files::choose(window, crate::files::Choice::ExportCommands).await?
    else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        let library = crate::snippets::read(&source)?;
        let bytes = serde_json::to_vec_pretty(&library).map_err(|_| "snippets_invalid")?;
        crate::atomic::write(&path, &bytes).map_err(|_| "snippets_save_failed")?;
        Ok(true)
    })
    .await
    .map_err(|_| "snippets_save_failed".to_string())?
}

#[tauri::command]
pub async fn editor_external_state(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    token: String,
    previous_digest: String,
) -> Result<crate::document::ExternalState, String> {
    let terminal = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::document::external_state(&terminal, &token, &previous_digest)
    })
    .await
    .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub async fn sftp_file_action(
    state: State<'_, crate::ssh::SshManager>,
    id: String,
    path: String,
    action: String,
) -> Result<(), String> {
    let terminal = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::sftp::file_action(&terminal, &path, &action)
    })
    .await
    .map_err(|_| "sftp_failed".to_owned())?
}
#[tauri::command]
pub async fn ssh_monitor(
    app: tauri::AppHandle,
    id: String,
) -> Result<crate::monitor::Sample, String> {
    use tauri::Manager;
    let terminal = app.state::<crate::ssh::SshManager>().get(&id)?;
    tauri::async_runtime::spawn_blocking(move || crate::monitor::sample(&terminal))
        .await
        .map_err(|_| "monitor_unavailable".to_string())?
}
#[tauri::command]
pub async fn tunnel_start(
    app: tauri::AppHandle,
    id: String,
    config: crate::tunnels::Config,
) -> Result<crate::tunnels::Info, String> {
    use tauri::Manager;
    let terminal = app.state::<crate::ssh::SshManager>().get(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::tunnels::Tunnels>()
            .start(id, terminal, config)
    })
    .await
    .map_err(|_| "tunnel_state".to_string())?
}
#[tauri::command]
pub fn tunnel_list(
    state: State<'_, crate::tunnels::Tunnels>,
    id: String,
) -> Vec<crate::tunnels::Info> {
    state.list(&id)
}
#[tauri::command]
pub fn tunnel_stop(state: State<'_, crate::tunnels::Tunnels>, id: String) {
    state.stop(&id)
}
#[tauri::command]
pub async fn sftp_upload_folder(
    state: State<'_, crate::ssh::SshManager>,
    window: tauri::WebviewWindow,
    id: String,
    directory: String,
    overwrite: bool,
) -> Result<Option<String>, String> {
    let terminal = state.get(&id)?;
    crate::sftp::path(&directory)?;
    let Some(local) = crate::files::choose(window, crate::files::Choice::UploadFolder).await?
    else {
        return Ok(None);
    };
    crate::sftp::start_folder(terminal, directory, local, overwrite).map(Some)
}

#[tauri::command]
pub fn open_project_link(page: &str) -> Result<(), String> {
    let suffix = match page {
        "project" => "",
        "changelog" => concat!("/releases/tag/v", env!("CARGO_PKG_VERSION")),
        "updates" => "/releases",
        "documentation" => "#readme",
        _ => return Err("invalid_project_link".into()),
    };
    let url = format!("https://github.com/TomateMozzarella/TermiX{suffix}");
    #[cfg(target_os = "windows")]
    let opener = "explorer.exe";
    #[cfg(target_os = "linux")]
    let opener = "xdg-open";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return Err("open_project_link_failed".into());
    #[cfg(any(target_os = "windows", target_os = "linux", target_os = "macos"))]
    {
        let mut child = std::process::Command::new(opener)
            .arg(url)
            .spawn()
            .map_err(|_| "open_project_link_failed".to_string())?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }
}
