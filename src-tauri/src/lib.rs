mod commands;
mod error;
mod logging;
mod models;
mod queue;

use std::sync::{Arc, Mutex};

use tauri::Listener;
use queue::SharedQueue;
use commands::download::ActiveProcesses;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let queue: SharedQueue = Arc::new(Mutex::new(queue::DownloadQueue::new()));
    let active_processes: ActiveProcesses = Arc::new(Mutex::new(std::collections::HashMap::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(queue.clone())
        .manage(active_processes)
        .setup(move |app| {
            commands::download::load_saved_queue(&app.handle(), &queue);

            // Restart request from the frontend after an update installs.
            let app_handle = app.handle().clone();
            let restart_handle = app_handle.clone();
            app_handle.listen("app:restart", move |_| {
                let _ = restart_handle.restart();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::analyze::analyze_video,
            commands::download::enqueue_download,
            commands::download::cancel_download,
            commands::download::cancel_all_downloads,
            commands::download::retry_download,
            commands::download::pause_download,
            commands::download::resume_download,
            commands::download::pause_all_downloads,
            commands::download::resume_all_downloads,
            commands::download::get_queue,
            commands::download::remove_from_queue,
            commands::download::open_in_explorer,
            commands::download::verify_output_dir,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::browse::browse_folder,
            commands::update::update_ytdlp,
            logging::log_to_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
