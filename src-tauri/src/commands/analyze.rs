use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use crate::models::{VideoMeta, FormatInfo, PlaylistEntry, AnalyzeResponse};

fn codec_display_name(codec: &str) -> String {
    if codec == "none" {
        return "None".to_string();
    }
    if codec.starts_with("avc1") || codec.starts_with("h264") {
        "H.264".to_string()
    } else if codec.starts_with("vp9") {
        "VP9".to_string()
    } else if codec.starts_with("av01") || codec.starts_with("av1") {
        "AV1".to_string()
    } else if codec.starts_with("mp4a") {
        "AAC".to_string()
    } else if codec.starts_with("opus") {
        "Opus".to_string()
    } else if codec.starts_with("mp3") {
        "MP3".to_string()
    } else if codec.is_empty() {
        "None".to_string()
    } else {
        codec.to_uppercase()
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

fn parse_video_meta(json: &serde_json::Value, url: &str) -> VideoMeta {
    let title = json["title"].as_str().unwrap_or("Unknown").to_string();
    let duration = json["duration"].as_f64().unwrap_or(0.0);
    let channel = json["channel"].as_str()
        .or_else(|| json["uploader"].as_str())
        .unwrap_or("Unknown")
        .to_string();
    let upload_date = json["upload_date"].as_str().unwrap_or("").to_string();
    let thumbnail_url = json["thumbnail"].as_str().unwrap_or("").to_string();
    let webpage_url = json["webpage_url"].as_str().unwrap_or(url).to_string();

    VideoMeta {
        title,
        duration,
        channel,
        upload_date,
        thumbnail_url,
        webpage_url,
        is_playlist: false,
        playlist_title: None,
        playlist_id: None,
        playlist_count: None,
    }
}

fn parse_formats(json: &serde_json::Value) -> Vec<FormatInfo> {
    let formats = match json["formats"].as_array() {
        Some(f) => f,
        None => return Vec::new(),
    };

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

    result
}

fn extract_thumbnail(entry: &serde_json::Value) -> String {
    // Prefer explicit thumbnail
    if let Some(t) = entry["thumbnail"].as_str() {
        if !t.is_empty() {
            return t.to_string();
        }
    }
    // Construct YouTube thumbnail from video ID
    if let Some(id) = entry["id"].as_str() {
        return format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", id);
    }
    // Attempt to parse video ID from URL as fallback
    if let Some(url) = entry["url"].as_str().or_else(|| entry["webpage_url"].as_str()) {
        if let Some(pos) = url.find("v=") {
            let after = &url[pos+2..];
            if let Some(end) = after.find(|c: char| c == '&' || c == '#') {
                return format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", &after[..end]);
            }
            return format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", after);
        }
    }
    String::new()
}

fn parse_playlist_entries(json: &serde_json::Value) -> Vec<PlaylistEntry> {
    let entries = match json["entries"].as_array() {
        Some(e) => e,
        None => return Vec::new(),
    };

    entries.iter().enumerate().map(|(i, entry)| {
        let title = entry["title"].as_str().unwrap_or("Unknown").to_string();
        let entry_url = entry["url"].as_str()
            .or_else(|| entry["webpage_url"].as_str())
            .unwrap_or("")
            .to_string();
        let thumbnail = extract_thumbnail(entry);
        let duration = entry["duration"].as_f64().unwrap_or(0.0);
        let index = entry["playlist_index"].as_u64().unwrap_or((i + 1) as u64) as u32;

        PlaylistEntry {
            index,
            title,
            url: entry_url,
            thumbnail,
            duration,
        }
    }).collect()
}

#[tauri::command]
pub async fn analyze_video(app: AppHandle, url: String) -> Result<AnalyzeResponse, String> {
    let sidecar = app.shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    // Single yt-dlp call with --flat-playlist
    // For single videos this returns full JSON with formats.
    // For playlists it returns entries list (minimal info per entry).
    let output = sidecar
        .args(["-J", "--no-download", "--flat-playlist", &url])
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

    // Check if this is a playlist by looking for entries array
    let entries = json["entries"].as_array();
    let is_playlist = entries.map(|e| e.len() > 1).unwrap_or(false);

    if is_playlist {
        let playlist_title = json["title"].as_str().unwrap_or("Playlist").to_string();
        let playlist_entries = parse_playlist_entries(&json);

        Ok(AnalyzeResponse {
            is_playlist: true,
            video_meta: None,
            formats: None,
            playlist_title: Some(playlist_title),
            playlist_entries: Some(playlist_entries),
        })
    } else {
        // Single video — the full JSON already has formats
        let video_meta = parse_video_meta(&json, &url);
        let formats = parse_formats(&json);

        Ok(AnalyzeResponse {
            is_playlist: false,
            video_meta: Some(video_meta),
            formats: Some(formats),
            playlist_title: None,
            playlist_entries: None,
        })
    }
}
