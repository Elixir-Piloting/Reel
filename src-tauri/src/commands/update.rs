use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    let response = reqwest::get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let binaries_dir = resource_dir.join("binaries");
    let _ = std::fs::create_dir_all(&binaries_dir);
    let target_path = binaries_dir.join("yt-dlp-x86_64-pc-windows-msvc.exe");

    std::fs::write(&target_path, &bytes)
        .map_err(|e| format!("Failed to write: {}", e))?;

    Ok(format!("Updated to {} bytes", bytes.len()))
}
