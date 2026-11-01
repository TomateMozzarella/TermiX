use tauri::State;
use crate::{error::AppError, models::Session, AppState};

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
