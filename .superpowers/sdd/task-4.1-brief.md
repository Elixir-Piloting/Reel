### Task 4.1: Create `AppError` enum

**Files:**
- Create: `src-tauri/src/error.rs`

```rust
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
    #[error("Cancelled")]
    Cancelled,
}
```

- [ ] **Create `error.rs`** with the AppError enum.
- [ ] **Modify `lib.rs`** to register the module: `mod error;`
- [ ] **Update command signatures** to return `Result<_, AppError>` instead of `Result<_, String>`.

