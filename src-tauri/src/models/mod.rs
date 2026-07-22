pub mod progress;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMeta {
    pub title: String,
    pub duration: f64,
    pub channel: String,
    pub upload_date: String,
    pub thumbnail_url: String,
    pub webpage_url: String,
    pub is_playlist: bool,
    pub playlist_title: Option<String>,
    pub playlist_id: Option<String>,
    pub playlist_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistEntry {
    pub index: u32,
    pub title: String,
    pub url: String,
    pub thumbnail: String,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: String,
    pub resolution: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub container: String,
    pub fps: Option<f64>,
    pub filesize: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    pub format_id: String,
    pub filename: String,
    pub output_dir: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub premiere_mode: bool,
    pub download_type: DownloadType,
    pub video_title: String,
    pub channel: String,
    pub duration: f64,
    pub thumbnail_url: String,
    pub has_audio: bool,
    pub encoding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadType {
    Video,
    Audio,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub title: String,
    pub filename: String,
    pub output_path: String,
    pub progress: f64,
    pub speed: String,
    pub eta: String,
    pub status: DownloadStatus,
    pub channel: String,
    pub duration: f64,
    pub thumbnail_url: String,
    pub ext: String,
    pub format_id: String,
    pub download_type: String,
    pub has_audio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Merging,
    Converting,
    Completed,
    Failed(String),
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeResponse {
    pub is_playlist: bool,
    pub video_meta: Option<VideoMeta>,
    pub formats: Option<Vec<FormatInfo>>,
    pub playlist_title: Option<String>,
    pub playlist_entries: Option<Vec<PlaylistEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub default_download_folder: String,
    pub auto_update_ytdlp: bool,
    pub auto_convert_premiere: bool,
    pub show_all_formats: bool,
    pub max_concurrent_downloads: u32,
}

pub fn resolve_filename_conflict(dir: &str, base_name: &str, ext: &str) -> String {
    let path = std::path::Path::new(dir).join(format!("{}.{}", base_name, ext));
    if !path.exists() {
        return format!("{}.{}", base_name, ext);
    }
    for i in 1..100 {
        let name = format!("{} [{}]", base_name, i);
        let path = std::path::Path::new(dir).join(format!("{}.{}", name, ext));
        if !path.exists() {
            return format!("{}.{}", name, ext);
        }
    }
    format!("{} [{}].{}", base_name, 99, ext)
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_download_folder: dirs::download_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("C:\\Users\\dog\\Downloads"))
                .to_string_lossy()
                .to_string(),
            auto_update_ytdlp: false,
            auto_convert_premiere: false,
            show_all_formats: false,
            max_concurrent_downloads: 3,
        }
    }
}
