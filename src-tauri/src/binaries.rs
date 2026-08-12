#[cfg(test)]
use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use tauri::{AppHandle, Emitter, Manager};

use serde::{Deserialize, Serialize};
use crate::error::AppError;

pub const YTDLP_BIN: &str = "yt-dlp.exe";
pub const FFMPEG_BIN: &str = "ffmpeg.exe";
const TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";

#[derive(Clone, Copy)]
pub enum Tool {
    YtDlp,
    Ffmpeg,
}

#[derive(Clone, Serialize)]
pub struct ToolStatus {
    pub installed: Option<String>,
    pub latest: Option<String>,
    pub state: String,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct BinaryStatus {
    pub ytdlp: ToolStatus,
    pub ffmpeg: ToolStatus,
}

impl Default for BinaryStatus {
    fn default() -> Self {
        Self {
            ytdlp: ToolStatus {
                installed: None,
                latest: None,
                state: "missing".into(),
                error: None,
            },
            ffmpeg: ToolStatus {
                installed: None,
                latest: None,
                state: "missing".into(),
                error: None,
            },
        }
    }
}

#[derive(Default)]
pub struct BinariesState(pub std::sync::Mutex<BinaryStatus>);

fn with_state<F: FnOnce(&mut BinaryStatus)>(app: &AppHandle, f: F) {
    if let Some(st) = app.try_state::<BinariesState>() {
        let mut guard = st.0.lock().unwrap();
        f(&mut guard);
    }
}

fn emit_status(app: &AppHandle) {
    if let Some(st) = app.try_state::<BinariesState>() {
        let snapshot = st.0.lock().unwrap().clone();
        let _ = app.emit("binary-status", &snapshot);
    }
}

pub fn bin_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("bin")
}

pub fn ytdlp_path(app: &AppHandle) -> PathBuf {
    bin_dir(app).join(YTDLP_BIN)
}

pub fn ffmpeg_path(app: &AppHandle) -> PathBuf {
    bin_dir(app).join(FFMPEG_BIN)
}

/// Copies the bundled resource copies into `bin\` when the target is missing.
/// Bundled files ship in `resource_dir()/binaries` with the target-triple
/// suffix stripped; also accept the suffixed name as a fallback.
pub fn ensure_bootstrapped(app: &AppHandle) -> std::io::Result<()> {
    let dir = bin_dir(app);
    std::fs::create_dir_all(&dir)?;
    for (bundled_name, target) in [("yt-dlp", YTDLP_BIN), ("ffmpeg", FFMPEG_BIN)] {
        let target_path = dir.join(target);
        if target_path.exists() {
            continue;
        }
        if let Some(src) = bundled_path(app, bundled_name) {
            std::fs::copy(&src, &target_path)?;
        }
    }
    Ok(())
}

fn bundled_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let res = app.path().resource_dir().ok()?;
    let plain = res.join("binaries").join(format!("{name}.exe"));
    if plain.exists() {
        return Some(plain);
    }
    let suffixed = res.join("binaries").join(format!("{name}-{TARGET_TRIPLE}.exe"));
    if suffixed.exists() {
        return Some(suffixed);
    }
    None
}

pub fn installed_version(path: &Path, tool: Tool) -> Option<String> {
    if !path.exists() {
        return None;
    }
    let out = match tool {
        Tool::YtDlp => StdCommand::new(path).arg("--version").output().ok()?,
        Tool::Ffmpeg => StdCommand::new(path).arg("-version").output().ok()?,
    };
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    match tool {
        Tool::YtDlp => parse_ytdlp_version(text.lines().next()?).map(str::to_string),
        Tool::Ffmpeg => parse_ffmpeg_version(text.lines().next()?),
    }
}

/// yt-dlp `--version` prints exactly the version token, e.g. `2026.08.05`.
pub fn parse_ytdlp_version(line: &str) -> Option<&str> {
    let t = line.trim();
    if !t.is_empty() && t.split_whitespace().count() == 1 && t.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        Some(t)
    } else {
        None
    }
}

/// ffmpeg `-version` first line: `ffmpeg version <token> Copyright ...`.
pub fn parse_ffmpeg_version(line: &str) -> Option<String> {
    let rest = line.trim_start().strip_prefix("ffmpeg version ")?;
    Some(rest.split_whitespace().next()?.trim_end_matches('.').to_string())
}

/// Compare dotted date versions like `2026.08.05`.
#[cfg(test)]
pub fn cmp_ytdlp_version(a: &str, b: &str) -> Ordering {
    let av: Vec<u64> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let bv: Vec<u64> = b.split('.').filter_map(|s| s.parse().ok()).collect();
    for (x, y) in av.iter().zip(bv.iter()) {
        match x.cmp(y) {
            Ordering::Equal => continue,
            o => return o,
        }
    }
    av.len().cmp(&bv.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ytdlp_version_single_line() {
        assert_eq!(parse_ytdlp_version("2026.08.05"), Some("2026.08.05"));
        assert_eq!(parse_ytdlp_version("  2026.01.01  "), Some("2026.01.01"));
        assert_eq!(parse_ytdlp_version(""), None);
        assert_eq!(parse_ytdlp_version("error: no such option"), None);
    }

    #[test]
    fn ffmpeg_version_first_token() {
        assert_eq!(
            parse_ffmpeg_version("ffmpeg version N-115054-gbf2258e35a Copyright (c) 2000-2024 the FFmpeg developers"),
            Some("N-115054-gbf2258e35a".to_string())
        );
        assert_eq!(
            parse_ffmpeg_version("ffmpeg version 6.1.1-full_build_www.gyan.dev Copyright (c) 2000-2023 the FFmpeg developers"),
            Some("6.1.1-full_build_www.gyan.dev".to_string())
        );
        assert_eq!(parse_ffmpeg_version("not ffmpeg at all"), None);
    }

    #[test]
    fn ytdlp_version_ordering() {
        assert_eq!(cmp_ytdlp_version("2026.08.05", "2026.08.04"), std::cmp::Ordering::Greater);
        assert_eq!(cmp_ytdlp_version("2026.08.05", "2026.08.05"), std::cmp::Ordering::Equal);
        assert_eq!(cmp_ytdlp_version("2025.12.31", "2026.01.01"), std::cmp::Ordering::Less);
        assert_eq!(cmp_ytdlp_version("2026.08.05.1", "2026.08.05"), std::cmp::Ordering::Greater);
    }

    #[test]
    fn extracts_ffmpeg_exe_from_zip() {
        use std::io::Write;
        let bytes = {
            let mut buf = std::io::Cursor::new(Vec::new());
            {
                let mut w = zip::ZipWriter::new(&mut buf);
                let opts = zip::write::SimpleFileOptions::default();
                let _ = w.start_file("bin/ffmpeg.exe", opts);
                let _ = w.write_all(b"MZ fake ffmpeg");
                let _ = w.finish();
            }
            buf.into_inner()
        };
        let out = std::env::temp_dir().join(format!("ffmpeg_test_{}.exe", std::process::id()));
        extract_ffmpeg_exe(&bytes, &out).unwrap();
        let got = std::fs::read(&out).unwrap();
        assert_eq!(got, b"MZ fake ffmpeg");
        let _ = std::fs::remove_file(&out);
    }
}

#[derive(Default, Serialize, Deserialize)]
struct BinariesMeta {
    last_ffmpeg_check_day: Option<u64>,
    last_ffmpeg_tag: Option<String>,
}

fn meta_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("binaries-meta.json")
}

fn load_meta(app: &AppHandle) -> BinariesMeta {
    std::fs::read_to_string(meta_path(app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_meta(app: &AppHandle, meta: &BinariesMeta) {
    if let Ok(s) = serde_json::to_string(meta) {
        let _ = std::fs::write(meta_path(app), s);
    }
}

fn today_epoch_day() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() / 86400)
        .unwrap_or(0)
}

pub fn ffmpeg_update_due(app: &AppHandle) -> bool {
    match load_meta(app).last_ffmpeg_check_day {
        None => true,
        Some(day) => today_epoch_day().saturating_sub(day) >= 7,
    }
}

/// Public for unit tests; extracts `bin/ffmpeg.exe` from a BtbN-style zip.
pub fn extract_ffmpeg_exe(zip_bytes: &[u8], out: &Path) -> Result<(), AppError> {
    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| AppError::StorageError(format!("invalid zip: {e}")))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| AppError::StorageError(format!("zip entry {i}: {e}")))?;
        if file.name() == "bin/ffmpeg.exe" {
            let mut target = std::fs::File::create(out)
                .map_err(|e| AppError::StorageError(format!("create {}: {e}", out.display())))?;
            std::io::copy(&mut file, &mut target)
                .map_err(|e| AppError::StorageError(format!("extract: {e}")))?;
            return Ok(());
        }
    }
    Err(AppError::StorageError("ffmpeg.exe not found in archive".into()))
}

pub async fn update_ffmpeg(app: &AppHandle) -> Result<String, AppError> {
    let release = crate::commands::update::fetch_latest_ffmpeg_release().await?;

    let mut meta = load_meta(app);
    if meta.last_ffmpeg_tag.as_deref() == Some(release.tag.as_str()) {
        meta.last_ffmpeg_check_day = Some(today_epoch_day());
        save_meta(app, &meta);
        return Ok(format!("ffmpeg already at {}", release.tag));
    }
    meta.last_ffmpeg_check_day = Some(today_epoch_day());
    save_meta(app, &meta);

    let client = crate::commands::update::http_client(crate::commands::update::DOWNLOAD_TIMEOUT);
    let bytes = client
        .get(&release.download_url)
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?
        .bytes()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    // Sanity: must be a ZIP archive (PK\x03\x04).
    if bytes.len() < 4 || &bytes[0..4] != b"PK\x03\x04" {
        return Err(AppError::NetworkError("Downloaded file is not a ZIP archive".into()));
    }

    let target = ffmpeg_path(app);
    let tmp = target.with_extension("exe.tmp");
    extract_ffmpeg_exe(&bytes, &tmp)?;

    // Smoke test: must report a version string.
    if installed_version(&tmp, Tool::Ffmpeg).is_none() {
        let _ = std::fs::remove_file(&tmp);
        return Err(AppError::FfmpegError("ffmpeg smoke test failed".into()));
    }

    let backup = target.with_extension("exe.bak");
    if target.exists() {
        let _ = std::fs::rename(&target, &backup);
    }
    std::fs::rename(&tmp, &target)
        .map_err(|e| AppError::StorageError(format!("replace ffmpeg: {e}")))?;

    let mut meta = load_meta(app);
    meta.last_ffmpeg_tag = Some(release.tag.clone());
    save_meta(app, &meta);

    with_state(app, |s| {
        s.ffmpeg.installed = installed_version(&ffmpeg_path(app), Tool::Ffmpeg);
        s.ffmpeg.latest = Some(release.tag.clone());
        s.ffmpeg.state = "up_to_date".into();
    });
    emit_status(app);

    Ok(format!("Updated ffmpeg to {}", release.tag))
}

pub async fn update_ytdlp(app: &AppHandle) -> Result<String, AppError> {
    let _ = ensure_bootstrapped(app);
    let (tag, download_url, expected_hash) = crate::commands::update::fetch_latest_release().await?;

    let installed = installed_version(&ytdlp_path(app), Tool::YtDlp);
    if installed.as_deref() == Some(tag.as_str()) {
        with_state(app, |s| {
            s.ytdlp.installed = installed;
            s.ytdlp.latest = Some(tag.clone());
            s.ytdlp.state = "up_to_date".into();
        });
        emit_status(app);
        return Ok(format!("yt-dlp already at {}", tag));
    }

    let client = crate::commands::update::http_client(crate::commands::update::DOWNLOAD_TIMEOUT);
    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    if let Some(hash) = expected_hash {
        use sha2::{Digest, Sha256};
        let actual = hex::encode(Sha256::digest(&bytes));
        if actual != hash {
            return Err(AppError::NetworkError(format!("SHA256 mismatch: expected {}, got {}", hash, actual)));
        }
    } else if bytes.len() < 2 || bytes[0] != b'M' || bytes[1] != b'Z' {
        return Err(AppError::NetworkError("Downloaded file is not a valid PE executable".into()));
    }

    let target = ytdlp_path(app);
    let tmp = target.with_extension("exe.tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| AppError::StorageError(e.to_string()))?;
    if target.exists() {
        let backup = target.with_extension("exe.bak");
        let _ = std::fs::rename(&target, &backup);
    }
    std::fs::rename(&tmp, &target).map_err(|e| AppError::StorageError(e.to_string()))?;

    with_state(app, |s| {
        let v = installed_version(&target, Tool::YtDlp);
        s.ytdlp.installed = v;
        s.ytdlp.latest = Some(tag.clone());
        s.ytdlp.state = "up_to_date".into();
    });
    emit_status(app);
    Ok(format!("Updated yt-dlp to {tag}"))
}

pub async fn run_launch_tasks(app: AppHandle) {
    let _ = ensure_bootstrapped(&app);

    with_state(&app, |s| {
        s.ytdlp.installed = installed_version(&ytdlp_path(&app), Tool::YtDlp);
        s.ffmpeg.installed = installed_version(&ffmpeg_path(&app), Tool::Ffmpeg);
        if s.ytdlp.installed.is_some() {
            s.ytdlp.state = "up_to_date".into();
        }
        if s.ffmpeg.installed.is_some() {
            s.ffmpeg.state = "up_to_date".into();
        }
    });
    emit_status(&app);

    let settings = crate::commands::settings::get_settings(app.clone());
    if settings.auto_update_ytdlp || installed_version(&ytdlp_path(&app), Tool::YtDlp).is_none() {
        match update_ytdlp(&app).await {
            Ok(_) => {}
            Err(e) => {
                with_state(&app, |s| {
                    s.ytdlp.state = "failed".into();
                    s.ytdlp.error = match serde_json::to_string(&e) {
                        Ok(s) => Some(truncate_status(s, 40)),
                        Err(_) => None,
                    };
                });
                emit_status(&app);
            }
        }
    }

    if ffmpeg_update_due(&app) {
        match update_ffmpeg(&app).await {
            Ok(_) => {}
            Err(e) => {
                let msg = truncate_status(e.to_string(), 40);
                with_state(&app, |s| {
                    s.ffmpeg.state = "offline".into();
                    s.ffmpeg.error = Some(msg);
                });
                emit_status(&app);
            }
        }
    }
}

fn truncate_status(s: String, max: usize) -> String {
    if s.len() <= max {
        s
    } else {
        let idx = s
            .char_indices()
            .nth(max)
            .map(|(i, _)| i)
            .unwrap_or(s.len());
        format!("{}…", &s[..idx])
    }
}
