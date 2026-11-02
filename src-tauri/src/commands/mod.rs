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
