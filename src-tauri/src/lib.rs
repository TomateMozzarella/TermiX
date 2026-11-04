mod address;
mod atomic;
mod commands;
mod document;
mod editors;
mod error;
mod files;
mod models;
mod preferences;
mod sftp;
mod ssh;
mod storage;
mod terminal;
mod vault;
mod workspace;

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
                window.state::<ssh::SshManager>().close_all();
            }
        })
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("sessions.json");
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let store = SessionStore::load(path)?;
            app.manage(ssh::SshManager::new(
                app.path().app_data_dir()?.join("known-hosts.json"),
            ));
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
            commands::get_catalog,
            commands::reload_catalog,
            commands::save_folder,
            commands::delete_folder,
            commands::touch_session,
            commands::pick_session_import,
            commands::import_sessions,
            commands::export_sessions,
            commands::choose_editor,
            commands::detect_editor,
            commands::terminal_profiles,
            commands::open_terminal,
            commands::read_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::close_terminal,
            commands::get_workspace,
            commands::save_workspace,
            commands::get_preferences,
            commands::save_preferences,
            commands::editor_open,
            commands::editor_save,
            commands::editor_reload,
            commands::editor_close,
            commands::editor_external,
            commands::editor_reload_external,
            commands::sftp_mkdir,
            commands::sftp_list,
            commands::sftp_upload,
            commands::sftp_download,
            commands::sftp_progress,
            commands::sftp_cancel,
            commands::ssh_probe,
            commands::ssh_cancel,
            commands::ssh_open,
            commands::ssh_forget_password
        ])
        .run(tauri::generate_context!())
        .expect("error while running TermiX");
}
