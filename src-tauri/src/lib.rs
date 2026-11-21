mod address;
mod app_data;
mod atomic;
mod commands;
mod document;
mod editors;
mod error;
mod files;
mod local_files;
mod models;
mod monitor;
mod ping;
mod preferences;
mod sftp;
mod shortcut;
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
    launch_session: Mutex<Option<String>>,
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
    // The main window is built in setup so native popup creation can be restricted.
    for window in &mut context.config_mut().app.windows {
        if window.label == "main" {
            window.create = false;
        }
    }
    tauri::Builder::default()
        .manage(terminal::TerminalManager::default())
        .manage(tunnels::Tunnels::default())
        .manage(document::OutputCopies::default())
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<terminal::TerminalManager>().close_all();
                window.state::<tunnels::Tunnels>().stop_all();
                window.state::<ssh::SshManager>().close_all();
                for (label, popup) in window.app_handle().webview_windows() {
                    if label.starts_with("terminal-popout-") {
                        let _ = popup.destroy();
                    }
                }
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
                launch_session: Mutex::new(shortcut::launch_session()),
                preferences: Mutex::new(preferences::PreferencesStore::new(
                    root.join("preferences.json"),
                )),
            });
            let handle = app.handle().clone();
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .ok_or("missing main window config")?;
            let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), config)?
                .on_new_window(move |url, features| {
                    use tauri::webview::NewWindowResponse;
                    if url.as_str() != "about:blank" {
                        return NewWindowResponse::Deny;
                    }
                    let label = format!("terminal-popout-{}", uuid::Uuid::new_v4());
                    match tauri::WebviewWindowBuilder::new(
                        &handle,
                        label,
                        tauri::WebviewUrl::External(url),
                    )
                    .window_features(features)
                    .title("TermiX")
                    .on_navigation(|url| url.as_str() == "about:blank")
                    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                    .build()
                    {
                        Ok(window) => NewWindowResponse::Create { window },
                        Err(_) => NewWindowResponse::Deny,
                    }
                });
            if let Some(portable) = std::env::current_exe()
                .ok()
                .and_then(|p| app_data::portable_root(&p))
            {
                builder = builder.data_directory(portable.join("data/webview"));
            }
            let window = builder.build()?;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                let _ = window.show();
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_project_link,
            commands::ui_ready,
            commands::get_snippets,
            commands::save_snippets,
            commands::pick_snippet_import,
            commands::import_snippets,
            commands::export_snippets,
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
            commands::open_rdp_session,
            commands::create_session_shortcut,
            commands::take_launch_session,
            commands::ping_session,
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
            commands::editor_terminal_output,
            commands::editor_reload_external,
            commands::sftp_mkdir,
            commands::sftp_list,
            commands::sftp_local_open,
            commands::sftp_local_list,
            commands::sftp_local_upload,
            commands::sftp_dropped_upload,
            commands::ssh_monitor,
            commands::tunnel_start,
            commands::tunnel_list,
            commands::tunnel_stop,
            commands::sftp_upload,
            commands::sftp_upload_folder,
            commands::sftp_download,
            commands::sftp_progress,
            commands::sftp_cancel,
            commands::sftp_pause_transfer,
            commands::ssh_probe,
            commands::ssh_cancel,
            commands::ssh_open,
            commands::ssh_forget_password
        ])
        .build(context)
        .expect("error while building TermiX")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<document::OutputCopies>().clear();
            }
        });
}
