mod commands;
mod error;
mod models;
mod storage;

use std::sync::Mutex;
use tauri::Manager;
use storage::SessionStore;

pub struct AppState {
    pub sessions: Mutex<SessionStore>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("sessions.json");
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let store = SessionStore::load(path)?;
            app.manage(AppState { sessions: Mutex::new(store) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::save_session,
            commands::delete_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running TermiX");
}
