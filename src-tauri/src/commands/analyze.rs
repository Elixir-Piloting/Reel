use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use crate::error::AppError;
use crate::models::{VideoMeta, FormatInfo, PlaylistEntry, AnalyzeResponse};

fn validate_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL is empty".into());
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".into());
    }
    let domain = url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("");
    if domain.is_empty() || !domain.contains('.') {
        return Err("URL must contain a valid domain".into());
    }
    Ok(())
}

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

fn parse_video_meta(json: &serde_json::Value, url: &str) -> Result<VideoMeta, AppError> {
    let title = json["title"]
        .as_str()
        .ok_or_else(|| AppError::MissingField("title".into()))?
        .to_string();
    let duration = json["duration"]
        .as_f64()
        .ok_or(AppError::MissingField("duration".into()))?;
    let webpage_url = json["webpage_url"]
        .as_str()
        .ok_or_else(|| AppError::MissingField("webpage_url".into()))?
        .to_string();

    let channel = json["channel"].as_str()
        .or_else(|| json["uploader"].as_str())
        .unwrap_or("Unknown")
        .to_string();
    let upload_date = json["upload_date"].as_str().unwrap_or("").to_string();
    let thumbnail_url = extract_thumbnail(json, url).unwrap_or_default();

    Ok(VideoMeta {
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
    })
}

fn normalize_resolution(note: &str) -> Option<u32> {
    let note = note.trim();
    if note.ends_with("p60") {
        if let Some(p) = note.strip_suffix("p60") {
            return p.parse::<u32>().ok();
        }
    }
    if note.ends_with('p') {
        if let Some(p) = note.strip_suffix('p') {
            return p.parse::<u32>().ok();
        }
    }
    if let Some(hd) = note.strip_prefix("hd") {
        return hd.parse::<u32>().ok();
    }
    match note {
        "medium" => Some(480),
        "small" => Some(360),
        "tiny" => Some(144),
        _ => None,
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

        let height = fmt["height"].as_u64()
            .or_else(|| fmt["format_note"].as_str().and_then(normalize_resolution).map(u64::from));

        let resolution_str = if let Some(res) = fmt["resolution"].as_str() {
            if !res.is_empty() {
                res.to_string()
            } else if let Some(h) = height {
                format!("{}p", h)
            } else if acodec != "none" && vcodec == "none" {
                "Audio only".to_string()
            } else {
                "Unknown".to_string()
            }
        } else if let Some(h) = height {
            format!("{}p", h)
        } else if acodec != "none" && vcodec == "none" {
            "Audio only".to_string()
        } else {
            "Unknown".to_string()
        };

        let (fsize, estimated) = if let Some(s) = fmt["filesize"].as_u64() {
            (Some(s), false)
        } else if let Some(s) = fmt["filesize_approx"].as_u64() {
            (Some(s), true)
        } else {
            let estimated_size = (|| {
                let tbr = fmt["tbr"].as_f64().or_else(|| fmt["vbr"].as_f64())?;
                let duration = json["duration"].as_f64()?;
                if tbr > 0.0 && duration > 0.0 {
                    Some((tbr * duration / 8.0) as u64)
                } else {
                    None
                }
            })();
            (estimated_size, true)
        };

        result.push(FormatInfo {
            format_id,
            ext: ext.clone(),
            resolution: resolution_str,
            video_codec: codec_display_name(vcodec),
            audio_codec: codec_display_name(acodec),
            container: determine_container(&ext, vcodec, acodec),
            fps: fmt["fps"].as_f64(),
            filesize: fsize,
            filesize_estimated: estimated,
        });
    }

    result
}

fn extract_thumbnail(data: &serde_json::Value, url: &str) -> Option<String> {
    if let Some(thumb) = data["thumbnail"].as_str() {
        if !thumb.is_empty() {
            return Some(thumb.to_string());
        }
    }
    let video_id = data["id"].as_str().or_else(|| {
        url.split('?').nth(1)?.split('&')
            .find_map(|p| p.strip_prefix("v="))
    })?;
    if video_id.len() == 11 && video_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Some(format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", video_id))
    } else {
        None
    }
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
        let thumbnail = extract_thumbnail(entry, &entry_url).unwrap_or_default();
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
pub async fn analyze_video(app: AppHandle, url: String) -> Result<AnalyzeResponse, AppError> {
    validate_url(&url).map_err(AppError::InvalidUrl)?;

    let sidecar = app.shell()
        .sidecar("yt-dlp")
        .map_err(|e| AppError::SidecarNotFound(e.to_string()))?;

    let output = sidecar
        .args(["-J", "--no-download", "--flat-playlist", &url])
        .output()
        .await
        .map_err(|e| AppError::YtDlpError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8(output.stderr)
            .map_err(|e| AppError::InvalidUtf8(e.to_string()))?;
        return Err(AppError::YtDlpError(stderr));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| AppError::InvalidUtf8(e.to_string()))?;
    let json: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| AppError::YtDlpError(e.to_string()))?;

    // Check if this is a playlist by looking for entries array
    let entries = json["entries"].as_array();
    if let Some(e) = &entries {
        if e.is_empty() {
            return Err(AppError::EmptyPlaylist);
        }
    }
    let is_playlist = entries.map(|e| e.len() >= 1).unwrap_or(false);

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
        let video_meta = parse_video_meta(&json, &url)?;
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
