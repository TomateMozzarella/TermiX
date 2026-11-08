mod address;
mod app_data;
mod atomic;
mod commands;
mod document;
mod editors;
mod error;
mod files;
mod models;
mod monitor;
mod preferences;
mod sftp;
mod snippets;
mod ssh;
mod storage;
mod terminal;
mod tunnels;
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
    if std::env::args().nth(1).as_deref() == Some("--clear-saved-credentials") {
        std::process::exit(if vault::clear_installed().is_ok() {
            0
        } else {
            1
        });
    }
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let mut context = tauri::generate_context!();
    if std::env::current_exe()
        .ok()
        .and_then(|p| app_data::portable_root(&p))
        .is_some()
    {
        for window in &mut context.config_mut().app.windows {
            // The config dataDirectory accepts relative paths only. Build the
            // portable window explicitly below with the native absolute-path setter.
            window.create = false;
        }
    }
    tauri::Builder::default()
        .manage(terminal::TerminalManager::default())
        .manage(tunnels::Tunnels::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<terminal::TerminalManager>().close_all();
                window.state::<tunnels::Tunnels>().stop_all();
                window.state::<ssh::SshManager>().close_all();
            }
        })
        .setup(|app| {
            let root = app_data::directory(app.handle()).map_err(std::io::Error::other)?;
            vault::set_portable_namespace(
                std::env::current_exe()
                    .ok()
                    .and_then(|p| app_data::portable_root(&p)),
            );
            let path = root.join("sessions.json");
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let store = SessionStore::load(path)?;
            app.manage(ssh::SshManager::new(root.join("known-hosts.json")));
            app.manage(AppState {
                sessions: Mutex::new(store),
                preferences: Mutex::new(preferences::PreferencesStore::new(
                    root.join("preferences.json"),
                )),
            });
            if let Some(portable) = std::env::current_exe()
                .ok()
                .and_then(|p| app_data::portable_root(&p))
            {
                let config = app.config();
                let window = config
                    .app
                    .windows
                    .iter()
                    .find(|w| w.label == "main")
                    .ok_or("missing main window config")?;
                tauri::WebviewWindowBuilder::from_config(app.handle(), window)?
                    .data_directory(portable.join("data/webview"))
                    .build()?;
            }
            let window = app
                .get_webview_window("main")
                .ok_or("missing main window")?;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                let _ = window.show();
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ui_ready,
            commands::get_snippets,
            commands::save_snippets,
            commands::editor_external_state,
            commands::sftp_file_action,
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
            commands::ssh_monitor,
            commands::tunnel_start,
            commands::tunnel_list,
            commands::tunnel_stop,
            commands::sftp_upload,
            commands::sftp_download,
            commands::sftp_progress,
            commands::sftp_cancel,
            commands::ssh_probe,
            commands::ssh_cancel,
            commands::ssh_open,
            commands::ssh_forget_password
        ])
        .run(context)
        .expect("error while running TermiX");
}

