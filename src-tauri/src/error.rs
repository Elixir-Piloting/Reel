use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("yt-dlp sidecar not found: {0}")]
    SidecarNotFound(String),
    #[error("yt-dlp returned an error: {0}")]
    YtDlpError(String),
    #[error("Download failed after {0} attempts: {1}")]
    DownloadFailed(u32, String),
    #[error("FFmpeg error: {0}")]
    FfmpegError(String),
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("Storage error: {0}")]
    StorageError(String),
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    #[error("Invalid UTF-8 in yt-dlp output: {0}")]
    InvalidUtf8(String),
    #[error("Cancelled")]
    Cancelled,
    #[error("Missing required field in yt-dlp response: {0}")]
    MissingField(String),
    #[error("The playlist is empty")]
    EmptyPlaylist,
}
