mod commands;
mod models;
mod queue;

use std::sync::{Arc, Mutex};
use queue::SharedQueue;
use commands::download::ActiveProcesses;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let queue: SharedQueue = Arc::new(Mutex::new(queue::DownloadQueue::new()));
    let active_processes = Arc::new(ActiveProcesses::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(queue)
        .manage(active_processes)
        .invoke_handler(tauri::generate_handler![
            commands::analyze::analyze_url,
            commands::formats::list_formats,
            commands::download::enqueue_download,
            commands::download::cancel_download,
            commands::download::get_queue,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::browse::browse_folder,
            commands::update::update_ytdlp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
