use tauri::{AppHandle, Manager};
use crate::models::AppSettings;

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("settings.json")
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    let path = settings_path(&app);
    let mut settings = if let Ok(data) = std::fs::read_to_string(&path) {
        match serde_json::from_str::<AppSettings>(&data) {
            Ok(s) => s,
            Err(e) => {
                crate::logging::log_info(&format!("[get_settings] Failed to parse settings.json: {}. Using defaults.", e));
                AppSettings::default()
            }
        }
    } else {
        AppSettings::default()
    };
    if settings.default_download_folder.trim().is_empty() {
        settings.default_download_folder = crate::models::default_download_folder();
    }
    settings
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app);
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    get_settings(app.clone())
}

/// Returns `--cookies <path>` args when a cookies.txt file is configured and exists.
pub fn cookies_args(app: &AppHandle) -> Vec<String> {
    let settings = load_settings(app);
    match settings.cookies_file.as_deref() {
        Some(path) if !path.trim().is_empty() && std::path::Path::new(path).exists() => {
            vec!["--cookies".to_string(), path.trim().to_string()]
        }
        _ => Vec::new(),
    }
}

/// Persists pasted cookie content to `cookies.txt` in the app data dir and returns its path.
#[tauri::command]
pub fn save_cookies_content(app: AppHandle, content: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("cookies.txt");
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
