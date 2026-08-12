use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn browse_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn browse_cookies_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("Cookies", &["txt"])
        .blocking_pick_file();
    Ok(file.map(|p| p.to_string()))
}
