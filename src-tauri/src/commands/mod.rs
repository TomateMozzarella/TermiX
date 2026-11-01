use crate::terminal::{Output, ShellProfile, TerminalManager};
use crate::{error::AppError, models::Session, AppState};
use tauri::State;

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
    state: State<'_, TerminalManager>,
    id: String,
) -> Result<Output, String> {
    let session = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || session.read())
        .await
        .map_err(|_| "PTY read worker failed".to_string())?
}

#[tauri::command]
pub async fn write_terminal(
    state: State<'_, TerminalManager>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let session = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || session.write(&data))
        .await
        .map_err(|_| "PTY write worker failed".to_string())?
}

#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || session.resize(cols, rows))
        .await
        .map_err(|_| "PTY resize worker failed".to_string())?
}

#[tauri::command]
pub async fn close_terminal(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<TerminalManager>().close(&id)
    })
    .await
    .map_err(|_| "PTY close worker failed".to_string())?
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
