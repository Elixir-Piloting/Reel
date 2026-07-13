use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn browse_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}
