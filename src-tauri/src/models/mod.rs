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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadType {
    VideoAudio,
    VideoOnly,
    AudioOnly,
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
pub struct AppSettings {
    pub default_download_folder: String,
    pub auto_update_ytdlp: bool,
    pub auto_convert_premiere: bool,
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
        }
    }
}
