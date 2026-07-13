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
    if let Ok(data) = std::fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppSettings::default()
    }
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app);
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}
