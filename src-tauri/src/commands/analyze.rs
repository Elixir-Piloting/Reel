use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use crate::models::VideoMeta;

#[tauri::command]
pub async fn analyze_url(app: AppHandle, url: String) -> Result<VideoMeta, String> {
    let sidecar = app.shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    let output = sidecar
        .args(["-J", "--no-download", "--no-playlist", &url])
        .output()
        .await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse yt-dlp output: {}", e))?;

    let title = json["title"].as_str().unwrap_or("Unknown").to_string();
    let duration = json["duration"].as_f64().unwrap_or(0.0);
    let channel = json["channel"].as_str()
        .or_else(|| json["uploader"].as_str())
        .unwrap_or("Unknown")
        .to_string();
    let upload_date = json["upload_date"].as_str().unwrap_or("").to_string();
    let thumbnail_url = json["thumbnail"].as_str().unwrap_or("").to_string();
    let webpage_url = json["webpage_url"].as_str().unwrap_or(&url).to_string();

    Ok(VideoMeta {
        title,
        duration,
        channel,
        upload_date,
        thumbnail_url,
        webpage_url,
    })
}
