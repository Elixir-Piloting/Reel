use tauri::AppHandle;
use serde::Deserialize;
use crate::error::AppError;

async fn fetch_latest_release() -> Result<(String, String, Option<String>), AppError> {
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
    let (_tag, download_url, expected_hash) = fetch_latest_release().await?;

    let response = reqwest::get(&download_url)
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    let bytes = response.bytes()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    // Verify checksum if available
    if let Some(hash) = expected_hash {
        use sha2::{Sha256, Digest};
        let actual = hex::encode(Sha256::digest(&bytes));
        if actual != hash {
            return Err(AppError::NetworkError(format!("SHA256 mismatch: expected {}, got {}", hash, actual)));
        }
    } else {
        // Fallback: verify PE magic bytes
        if bytes.len() < 2 || bytes[0] != b'M' || bytes[1] != b'Z' {
            return Err(AppError::NetworkError("Downloaded file is not a valid PE executable".into()));
        }
    }

    let _ = crate::binaries::ensure_bootstrapped(&app);
    let target_path = crate::binaries::ytdlp_path(&app);

    // Atomic replace with temp file
    let tmp_path = target_path.with_extension("exe.tmp");
    tokio::fs::write(&tmp_path, &bytes).await.map_err(|e| AppError::StorageError(e.to_string()))?;
    if target_path.exists() {
        let backup = target_path.with_extension("exe.bak");
        let _ = tokio::fs::rename(&target_path, &backup).await;
    }
    tokio::fs::rename(&tmp_path, &target_path).await.map_err(|e| AppError::StorageError(e.to_string()))?;

    Ok(format!("Updated yt-dlp to {} bytes", bytes.len()))
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
