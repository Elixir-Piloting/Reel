use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use crate::models::FormatInfo;

fn codec_display_name(codec: &str) -> String {
    match codec {
        "avc1" | "h264" => "H.264".to_string(),
        "vp9" => "VP9".to_string(),
        "av01" | "av1" => "AV1".to_string(),
        "mp4a" => "AAC".to_string(),
        "opus" => "Opus".to_string(),
        "mp3" => "MP3".to_string(),
        "none" => "None".to_string(),
        _ => codec.to_uppercase(),
    }
}

fn determine_container(ext: &str, video_codec: &str, _audio_codec: &str) -> String {
    if ext == "mp4" || video_codec.contains("h264") || video_codec.contains("avc") {
        "MP4".to_string()
    } else if ext == "webm" || video_codec == "vp9" || video_codec == "av01" {
        "WEBM".to_string()
    } else if ext == "m4a" {
        "M4A".to_string()
    } else if ext == "3gp" {
        "3GP".to_string()
    } else {
        ext.to_uppercase()
    }
}

#[tauri::command]
pub async fn list_formats(app: AppHandle, url: String) -> Result<Vec<FormatInfo>, String> {
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

    let formats = json["formats"].as_array()
        .ok_or("No formats found")?;

    let mut result: Vec<FormatInfo> = Vec::new();

    for fmt in formats {
        let format_id = fmt["format_id"].as_str().unwrap_or("").to_string();
        let ext = fmt["ext"].as_str().unwrap_or("").to_string();
        let vcodec = fmt["vcodec"].as_str().unwrap_or("none");
        let acodec = fmt["acodec"].as_str().unwrap_or("none");

        if vcodec == "none" && acodec == "none" {
            continue;
        }

        let resolution = fmt["resolution"].as_str()
            .or_else(|| fmt["format_note"].as_str())
            .unwrap_or("")
            .to_string();

        let height = fmt["height"].as_u64().unwrap_or(0);
        let resolution_str = if resolution.is_empty() && height > 0 {
            format!("{}p", height)
        } else if resolution.is_empty() {
            if acodec != "none" && vcodec == "none" {
                "Audio only".to_string()
            } else {
                "Unknown".to_string()
            }
        } else {
            resolution
        };

        result.push(FormatInfo {
            format_id,
            ext: ext.clone(),
            resolution: resolution_str,
            video_codec: codec_display_name(vcodec),
            audio_codec: codec_display_name(acodec),
            container: determine_container(&ext, vcodec, acodec),
            fps: fmt["fps"].as_f64(),
            filesize: fmt["filesize"].as_u64().or_else(|| fmt["filesize_approx"].as_u64()),
        });
    }

    Ok(result)
}
