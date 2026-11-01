mod commands;
mod error;
mod models;
mod preferences;
mod storage;
mod terminal;

use std::sync::Mutex;
use storage::SessionStore;
use tauri::Manager;

pub struct AppState {
    pub sessions: Mutex<SessionStore>,
    pub preferences: Mutex<preferences::PreferencesStore>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .manage(terminal::TerminalManager::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<terminal::TerminalManager>().close_all();
            }
        })
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("sessions.json");
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let store = SessionStore::load(path)?;
            app.manage(AppState {
                sessions: Mutex::new(store),
                preferences: Mutex::new(preferences::PreferencesStore::new(
                    app.path().app_data_dir()?.join("preferences.json"),
                )),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::save_session,
            commands::delete_session,
            commands::terminal_profiles,
            commands::open_terminal,
            commands::read_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::close_terminal,
            commands::get_preferences,
            commands::save_preferences
        ])
        .run(tauri::generate_context!())
        .expect("error while running TermiX");
}
