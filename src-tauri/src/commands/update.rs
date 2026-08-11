use tauri::{AppHandle, State};
use serde::Deserialize;
use crate::error::AppError;

pub async fn fetch_latest_release() -> Result<(String, String, Option<String>), AppError> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .header("User-Agent", "ytmate/0.1")
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    let json: serde_json::Value = resp.json().await.map_err(|e| AppError::NetworkError(e.to_string()))?;
    let tag = json["tag_name"].as_str().unwrap_or("latest").to_string();
    let download_url = json["assets"].as_array()
        .and_then(|assets| assets.iter().find(|a| {
            a["name"].as_str().map(|n| n.contains("yt-dlp.exe")).unwrap_or(false)
        }))
        .and_then(|a| a["browser_download_url"].as_str().map(String::from))
        .ok_or_else(|| AppError::NetworkError("Download URL not found".into()))?;
    let body = json["body"].as_str().unwrap_or("");
    let hash = body.lines()
        .find(|l| l.contains("SHA256") || l.contains("sha256"))
        .and_then(|l| l.split_whitespace().find(|w| w.len() == 64 && w.chars().all(|c| c.is_ascii_hexdigit())))
        .map(String::from);
    Ok((tag, download_url, hash))
}

#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, AppError> {
    crate::binaries::update_ytdlp(&app).await
}

#[tauri::command]
pub async fn update_ffmpeg(app: AppHandle) -> Result<String, AppError> {
    crate::binaries::update_ffmpeg(&app).await
}

#[tauri::command]
pub fn binary_status(app: AppHandle, state: State<'_, crate::binaries::BinariesState>) -> crate::binaries::BinaryStatus {
    let _ = app;
    state.0.lock().unwrap().clone()
}

#[derive(Deserialize)]
pub struct FfmpegRelease {
    pub tag: String,
    #[serde(rename = "browser_download_url")]
    pub download_url: String,
}

pub async fn fetch_latest_ffmpeg_release() -> Result<FfmpegRelease, AppError> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest")
        .header("User-Agent", "ytmate/0.1")
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    let json: serde_json::Value = resp.json().await.map_err(|e| AppError::NetworkError(e.to_string()))?;
    let tag = json["tag_name"].as_str().unwrap_or("latest").to_string();
    let download_url = json["assets"]
        .as_array()
        .and_then(|assets| assets.iter().find(|a| {
            a["name"].as_str().map(|n| n == "ffmpeg-master-latest-win64-gpl.zip").unwrap_or(false)
        }))
        .and_then(|a| a["browser_download_url"].as_str().map(String::from))
        .ok_or_else(|| AppError::NetworkError("ffmpeg zip URL not found".into()))?;
    Ok(FfmpegRelease { tag, download_url })
}
