use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use tauri::{AppHandle, Manager};

pub const YTDLP_BIN: &str = "yt-dlp.exe";
pub const FFMPEG_BIN: &str = "ffmpeg.exe";
const TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";

#[derive(Clone, Copy)]
pub enum Tool {
    YtDlp,
    Ffmpeg,
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

/// Copies the bundled sidecar copies into `bin\` when the target is missing.
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
}