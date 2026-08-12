# Runtime Binary Management, Premiere Toggle, Downloads\REEL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app manage its `yt-dlp`/`ffmpeg` binaries out of `%APPDATA%\com.dog.reel\bin` (bundled copies act as an offline bootstrap; yt-dlp updates on launch, ffmpeg weekly, all silent and non-blocking), surface their versions in Settings for self-diagnosis, add a Premiere-compatible toggle to the download page, and default the download folder to `%USERPROFILE%\Downloads\REEL`.

**Architecture:** A new Rust module `binaries.rs` owns path resolution, bootstrapping, version parsing, and both update flows (yt-dlp every launch, ffmpeg weekly) against a managed `BinaryStatus` that the frontend reads via a `binary_status` command and a `binary-status` event. The three existing `sidecar()` spawn sites switch to `app.shell().command(<app-data path>)` (Rust-side, no capability change needed). The Premiere toggle binds the existing options-store `premiereMode`; the dead `auto_convert_premiere` setting is removed. The download-folder default moves to `Downloads\REEL` with an empty-stored-value normalization.

**Tech Stack:** Rust (Tauri v2, tauri-plugin-shell v2, tokio, reqwest, sha2, hex, serde, thiserror, zip), React + zustand + TypeScript (stores, `select.tsx`/toasts), `@tauri-apps/api`.

## Global Constraints

- Binary dir: `<app_data_dir>/bin` (`%APPDATA%\com.dog.reel\bin`), created on launch; never Program Files.
- Bundled bootstrap: `binaries/yt-dlp` and `binaries/ffmpeg` (kept in `externalBin` + `resources`); copied into `bin\` on first launch when missing, preferred source is `bin\` afterwards.
- yt-dlp: check every launch (async, non-blocking); auto_update_ytdlp setting, default **ON** (both Rust default and frontend initial state). Stored `false` wins for existing users.
- ffmpeg: bundled + weekly opportunistic check (7-day cadence via stored epoch-day); never blocks startup.
- All update failures are silent and non-blocking: keep current binary, set state (`failed`/`offline`), retry next opportunity.
- Update downloads: temp file → atomic rename, keep `.bak` during swap (existing pattern in `update.rs:61-68`).
- Spawn the living binaries via `app.shell().command(<abs path>)` (Rust-side; `Shell::command` returns `Command`, no ACL). Do NOT gate on capabilities.
- Premiere: per-download toggle on the download page only; remove `auto_convert_premiere` (Rust `AppSettings` field, frontend `AppSettings` type, Settings toggle).
- Default download folder: `dirs::download_dir()\REEL`; normalize a persisted empty string to that value in `get_settings`.
- Existing yt-dlp H.265/merge gap fixed by passing `--ffmpeg-location <bin_dir>` to yt-dlp.
- Verification only: `cargo test` (Rust unit tests only — no test framework exists in the repo beyond `#[cfg(test)]`), `cargo build`, `npx tsc --noEmit`, `npm run build`, manual `npm run tauri dev`.

---

### Task 1: `binaries.rs` — paths, bootstrapping, version helpers

**Files:**
- Create: `src-tauri/src/binaries.rs`
- Modify: `src-tauri/src/lib.rs:5` (add `mod binaries;`)
- Test: unit tests inline in `src-tauri/src/binaries.rs`

**Interfaces:**
- Consumes: `AppHandle` (via `app.path().app_data_dir()`), bundled sidecars at `resource_dir()/binaries/{yt-dlp|ffmpeg}(-x86_64-pc-windows-msvc).exe`.
- Produces (used by later tasks):
  - `pub enum Tool { YtDlp, Ffmpeg }`
  - `pub fn bin_dir(app: &AppHandle) -> PathBuf`
  - `pub fn ytdlp_path(app: &AppHandle) -> PathBuf`
  - `pub fn ffmpeg_path(app: &AppHandle) -> PathBuf`
  - `pub fn ensure_bootstrapped(app: &AppHandle) -> std::io::Result<()>`
  - `pub fn installed_version(path: &std::path::Path, tool: Tool) -> Option<String>`
  - `pub fn parse_ytdlp_version(line: &str) -> Option<&str>`
  - `pub fn parse_ffmpeg_version(line: &str) -> Option<String>`
  - `pub fn cmp_ytdlp_version(a: &str, b: &str) -> std::cmp::Ordering`

**Verification command for this task:** `cargo test` then `cargo build`.

- [ ] **Step 1: Write the failing unit tests**

Append this test module to the new file before writing any functions (create `src-tauri/src/binaries.rs` with the module stub):

```rust
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --lib`
Expected: FAIL — `cannot find function parse_ytdlp_version` etc.

- [ ] **Step 3: Implement `binaries.rs`**

Write the full file:

```rust
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
    if !t.is_empty() && t.split_whitespace().count() == 1 && t.chars().next().is_ascii_digit() {
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
```

- [ ] **Step 4: Register the module in `lib.rs`**

Add at the top of `src-tauri/src/lib.rs`:

```rust
mod binaries;
```

- [ ] **Step 5: Run tests + build**

Run: `cargo test --lib` then `cargo build`
Expected: all 3 tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/binaries.rs src-tauri/src/lib.rs
git commit -m "feat: binaries module for app-data bin paths and version helpers"
```

---

### Task 2: Retarget yt-dlp update + spawn living binaries from `bin\`

**Files:**
- Modify: `src-tauri/src/commands/update.rs:54-70` (write into `bin\` instead of resource dir)
- Modify: `src-tauri/src/commands/analyze.rs:284-292` (spawn via `command()`)
- Modify: `src-tauri/src/commands/download.rs:412-423` (add `--ffmpeg-location`), `:503-530` (spawn via `command()`), `:650-680` (ffmpeg spawn via `command()`)
- Modify: `src-tauri/src/error.rs:6-7` (remove `SidecarNotFound`, stop using the word "sidecar")
- Modify: `src/features/download-history/DownloadList.tsx:72` (error detection no longer matches "Sidecar")

**Interfaces:**
- Consumes: `binaries::{bin_dir, ytdlp_path, ffmpeg_path, FFMPEG_BIN}` from Task 1.
- Produces: runtime binaries are spawned from `bin\`; yt-dlp download args include `--ffmpeg-location`; no remaining `sidecar("yt-dlp")`/`sidecar("ffmpeg")` call sites.

- [ ] **Step 1: Retarget `update_ytdlp` to `bin\`**

In `src-tauri/src/commands/update.rs`, replace lines 54-59:

```rust
    let resource_dir = app.path().resource_dir()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let binaries_dir = resource_dir.join("binaries");
    let _ = std::fs::create_dir_all(&binaries_dir);
    let target_path = binaries_dir.join("yt-dlp-x86_64-pc-windows-msvc.exe");
```

with:

```rust
    let _ = crate::binaries::ensure_bootstrapped(&app);
    let target_path = crate::binaries::ytdlp_path(&app);
```

Keep the atomic temp-file replace block (lines 61-68) unchanged.

- [ ] **Step 2: Analyze — spawn yt-dlp from `bin\`**

In `src-tauri/src/commands/analyze.rs`, replace lines 284-292 (`let sidecar = app.shell().sidecar("yt-dlp")...` through the `.output().await`):

```rust
    let output = app
        .shell()
        .command(crate::binaries::ytdlp_path(&app))
        .args(["-J", "--no-download", "--flat-playlist", &url])
        .output()
        .await
        .map_err(|e| AppError::YtDlpError(e.to_string()).to_string())?;
```

- [ ] **Step 3: Add `--ffmpeg-location` to yt-dlp video args**

In `src-tauri/src/commands/download.rs`, inside `DownloadType::Video` after the `mp4_h265` postprocessor-args block (around line 420-423), add:

```rust
                let ffmpeg_abs = crate::binaries::bin_dir(&app).join(crate::binaries::FFMPEG_BIN);
                args.push("--ffmpeg-location".to_string());
                args.push(ffmpeg_abs.to_string_lossy().into_owned());
```

- [ ] **Step 4: Download — spawn yt-dlp from `bin\`**

In `src-tauri/src/commands/download.rs`, replace the spawn at lines 503-530:

```rust
        let (mut rx, child) = match app.shell().sidecar("yt-dlp") {
            Ok(cmd) => match cmd.args(&args).spawn() {
                Ok(pair) => {
                    crate::logging::log_info("[process_download] yt-dlp process spawned OK");
                    pair
                },
                Err(e) => {
                    crate::logging::log_error(&format!("[process_download] ERROR spawning yt-dlp: {}", e));
                    crate::logging::log_info("[process_download] will retry after spawn error");
                    continue 'retry;
                }
            },
            Err(e) => {
                let msg = format!("Sidecar not found: {}", e);
                crate::logging::log_error(&format!("[process_download] ERROR sidecar not found: {}", e));
                let mut q = lock_mutex(&queue);
                let already_cancelled = q.items.iter().any(|i| i.id == id && i.status == "Cancelled");
                if already_cancelled {
                    return;
                }
                q.update(&id, |item| {
                    item.status = "Failed".to_string();
                    item.error = Some(msg.clone());
                });
                emit_progress(&app, &id, 0.0, "", "", &msg);
                return;
            }
        };
```

with:

```rust
        let (mut rx, child) = match app
            .shell()
            .command(crate::binaries::ytdlp_path(&app))
            .args(&args)
            .spawn()
        {
            Ok(pair) => {
                crate::logging::log_info("[process_download] yt-dlp process spawned OK");
                pair
            },
            Err(e) => {
                crate::logging::log_error(&format!("[process_download] ERROR spawning yt-dlp: {}", e));
                crate::logging::log_info("[process_download] will retry after spawn error");
                continue 'retry;
            }
        };
```

- [ ] **Step 5: Download — spawn ffmpeg from `bin\`**

In `src-tauri/src/commands/download.rs`, replace the ffmpeg spawn at lines 650-680 (`let (mut conv_rx, _conv_child) = match app.shell().sidecar("ffmpeg") { ... }`) with:

```rust
                                let (mut conv_rx, _conv_child) = match app
                                    .shell()
                                    .command(crate::binaries::ffmpeg_path(&app))
                                    .args([
                                        "-i", &input_path,
                                        "-c:v", "libx264",
                                        "-pix_fmt", "yuv420p",
                                        "-c:a", "aac",
                                        "-y", &temp_path,
                                    ])
                                    .spawn()
                                {
                                    Ok(pair) => pair,
                                    Err(e) => {
                                        emit_item_update(&app, &queue, &id);
                                        lock_mutex(&queue).update(&id, |item| {
                                            item.status = "Failed".to_string();
                                            item.error = Some(format!("FFmpeg spawn error: {}", e));
                                        });
                                        save_queue(&app, &queue);
                                        emit_progress(&app, &id, 0.0, "", "", &format!("Failed: FFmpeg error: {}", e));
                                        return;
                                    }
                                };
```

- [ ] **Step 6: Remove the `SidecarNotFound` error variant**

In `src-tauri/src/error.rs`, remove:

```rust
    #[error("yt-dlp sidecar not found: {0}")]
    SidecarNotFound(String),
```

Verify `cargo build` passes (grep for `SidecarNotFound` first: `rg "SidecarNotFound" src-tauri/src` — after Task 2 Step 2 there must be zero matches).

- [ ] **Step 7: Update `DownloadList` error detection**

In `src/features/download-history/DownloadList.tsx:72-78`, change the condition and copy:

```tsx
{(item.error?.toLowerCase().includes('yt-dlp')) && (
  <div className="mt-2 p-2 border border-destructive/30 bg-destructive/10 rounded text-center">
    <p className="text-xs font-medium">yt-dlp unavailable</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">The download tool is missing or was not set up.</p>
    <button onClick={() => dataService.updateYtdlp()} className="text-[10px] text-primary underline mt-1">Download yt-dlp</button>
  </div>
)}
```

(replacing the old `item.error?.includes('Sidecar') || item.error?.includes('sidecar')` condition).

- [ ] **Step 8: Verify**

Run: `cargo build` then `npx tsc --noEmit`
Expected: both succeed; `rg "sidecar\(" src-tauri/src` returns zero matches for yt-dlp/ffmpeg (a `window.close`-style use of shell isn't present).

- [ ] **Step 9: Manual check (optional, `npm run tauri dev`)**

Launch, paste a URL, download. Then check `%APPDATA%\com.dog.reel\bin` contains `yt-dlp.exe` and (after the first download) a valid output. The app operates even if the installed `yt-dlp` was updated at launch.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/commands/update.rs src-tauri/src/commands/analyze.rs src-tauri/src/commands/download.rs src-tauri/src/error.rs src/features/download-history/DownloadList.tsx
git commit -m "feat: spawn runtime binaries from app-data bin with --ffmpeg-location"
```

---

### Task 3: ffmpeg weekly updater (zip, smoke test, atomic replace)

**Files:**
- Modify: `src-tauri/Cargo.toml:38` (add `zip` after `futures` line)
- Modify: `src-tauri/src/commands/update.rs` (add `FfmpegRelease` + `fetch_latest_ffmpeg_release` — required so Task 3's `update_ffmpeg` compiles; Task 4 reuses them)
- Modify: `src-tauri/src/binaries.rs` (add meta persistence + `extract_ffmpeg_exe` + `update_ffmpeg`)
- Test: unit test in `binaries.rs` for `extract_ffmpeg_exe`

**Interfaces:**
- Consumes: `bin_dir`, `ffmpeg_path`, `installed_version`, `Tool` from Task 1; `AppError`; settings timestamp stored in `binaries-meta.json`.
- Produces:
  - `pub fn extract_ffmpeg_exe(zip_bytes: &[u8], out: &Path) -> Result<(), AppError>`
  - `pub async fn update_ffmpeg(app: &AppHandle) -> Result<String, AppError>` — checks BtbN GitHub latest release, downloads `ffmpeg-master-latest-win64-gpl.zip`, verifies it's a ZIP, extracts `bin/ffmpeg.exe`, smoke-tests `-version`, atomically swaps into `bin\ffmpeg.exe`, records `last_ffmpeg_tag` + `last_ffmpeg_check_day`.
  - `pub fn ffmpeg_update_due(app: &AppHandle) -> bool` — true when `last_ffmpeg_check_day` is absent or ≥7 days ago.

- [ ] **Step 1: Add `zip` dependency**

In `src-tauri/Cargo.toml`, after the `futures = "0.3"` line add:

```toml
zip = { version = "2", default-features = false, features = ["deflate"] }
```

Run: `cargo build` — expected: compiles (adds `zip`).

- [ ] **Step 2: Write the failing extraction test**

Append to the `tests` module in `src-tauri/src/binaries.rs`:

```rust
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cargo test --lib extracts_ffmpeg_exe_from_zip`
Expected: FAIL — `cannot find function extract_ffmpeg_exe`.

- [ ] **Step 4: Implement the ffmpeg updater**

Add to `src-tauri/src/binaries.rs`:

```rust
use crate::error::AppError;
use serde::{Deserialize, Serialize};

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
    let bytes = reqwest::get(&release.download_url)
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
    meta.last_ffmpeg_check_day = Some(today_epoch_day());
    meta.last_ffmpeg_tag = Some(release.tag.clone());
    save_meta(app, &meta);

    Ok(format!("Updated ffmpeg to {}", release.tag))
}
```

Then add the ffmpeg release fetcher to `src-tauri/src/commands/update.rs` (add `use serde::Deserialize;` at the top). This lives here so Task 3 compiles; Task 4 does not add it again:

```rust
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
```

Note: this task introduces two struct/function names that Task 4 completes (state/emit). Keep it building now: `load_meta`/`save_meta`/`meta_path` are private helpers used here; the `AppError::FfmpegError` variant already exists in `error.rs`.

- [ ] **Step 5: Run the tests + build**

Run: `cargo test --lib` then `cargo build`
Expected: `extracts_ffmpeg_exe_from_zip` and the 3 Task-1 tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/binaries.rs
git commit -m "feat: opportunistic ffmpeg update via BtbN zip with smoke test"
```

---

### Task 4: Binary status state, launch tasks, Settings indicator

**Files:**
- Modify: `src-tauri/src/binaries.rs` (status structs, `BinariesState`, `run_launch_tasks`, `update_ytdlp` core + status emit, register `update_ffmpeg` command core)
- Modify: `src-tauri/src/commands/update.rs` (make `fetch_latest_release` `pub`; keep a thin `update_ytdlp` command wrapper; `FfmpegRelease`/`fetch_latest_ffmpeg_release` already added in Task 3)
- Modify: `src-tauri/src/commands/settings.rs` (no code change — `get_settings` is already `pub` and callable from `run_launch_tasks`; listed only for the `git add` in Step 12)
- Modify: `src-tauri/src/lib.rs` (manage state, register commands, spawn launch tasks in `.setup`)
- Modify: `src-tauri/src/models/mod.rs:130` (`auto_update_ytdlp` default → `true`)
- Modify: `src/shared/lib/types.ts` (add `ToolStatus`, `BinaryStatus`)
- Modify: `src/shared/lib/data-service.ts` (add `binaryStatus`, `updateFfmpeg`)
- Create: `src/stores/binary-status-store.ts`
- Modify: `src/features/settings/SettingsPage.tsx` (Download tools block + "Update now")
- Modify: `src/stores/settings-store.ts:15` (`auto_update_ytdlp` initial → `true`)
- Modify: `src/App.tsx` (call `useBinaryStatusStore.getState().refresh()` on app load — verify mount point during implementation; if `loadSettings` is invoked in a layout/root, put the binary-status refresh alongside it)

**Interfaces:**
- Consumes: bins from Tasks 1-3; `AppSettings::default()`/`get_settings`.
- Produces:
  - `#[derive(Clone, serde::Serialize)] pub struct ToolStatus { pub installed: Option<String>, pub latest: Option<String>, pub state: String }`
  - `#[derive(Clone, serde::Serialize)] pub struct BinaryStatus { pub ytdlp: ToolStatus, pub ffmpeg: ToolStatus }`
  - `pub struct BinariesState(pub std::sync::Mutex<BinaryStatus>)`
  - `pub async fn update_ytdlp(app: &AppHandle) -> Result<String, AppError>`
  - `pub async fn update_ffmpeg(app: &AppHandle) -> Result<String, AppError>` (wraps Task 3 core)
  - `pub async fn run_launch_tasks(app: AppHandle)`
  - command `binary_status(app: AppHandle, state: State<BinariesState>) -> BinaryStatus`
  - ensure module compiles: add `use tauri::Emitter;` for `emit` (`Manager` is already imported from Task 1; `State` is imported in `update.rs` where the `binary_status` command lives).

- [ ] **Step 1: Status structs + state in `binaries.rs`**

Add to `src-tauri/src/binaries.rs` (near the top, after the `Tool` enum):

```rust
use tauri::Emitter;

#[derive(Clone, Serialize)]
pub struct ToolStatus {
    pub installed: Option<String>,
    pub latest: Option<String>,
    pub state: String,
}

#[derive(Clone, Serialize)]
pub struct BinaryStatus {
    pub ytdlp: ToolStatus,
    pub ffmpeg: ToolStatus,
}

impl Default for BinaryStatus {
    fn default() -> Self {
        Self {
            ytdlp: ToolStatus { installed: None, latest: None, state: "missing".into() },
            ffmpeg: ToolStatus { installed: None, latest: None, state: "missing".into() },
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
```

- [ ] **Step 2: Add the yt-dlp/ffmpeg release fetchers and update cores**

Make `fetch_latest_release` in `update.rs` `pub` so `binaries.rs` can call it (`FfmpegRelease`/`fetch_latest_ffmpeg_release` already exist in `update.rs` from Task 3):

```rust
pub async fn fetch_latest_release() -> Result<(String, String, Option<String>), AppError> {
```

Then in `src-tauri/src/binaries.rs`, after `update_ffmpeg`, add the shared yt-dlp update core and the full `update_ffmpeg` command core (replaces the version from Task 3 with one that sets state):

```rust
pub async fn update_ytdlp(app: &AppHandle) -> Result<String, AppError> {
    let _ = ensure_bootstrapped(app);
    let (tag, download_url, expected_hash) = crate::commands::update::fetch_latest_release().await?;
    let resp = reqwest::get(&download_url)
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
```

Rewrite the Task-3 `update_ffmpeg` to the canonical version below (records `last_ffmpeg_check_day` up front so every outcome — success, no-change, or failure — records the check, avoiding a retry every launch; and records state on success, replacing the old mid-body `load_meta`/`save_meta`):

```rust
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

    let bytes = reqwest::get(&release.download_url)
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

    with_state(app, |s| {
        s.ffmpeg.installed = installed_version(&ffmpeg_path(app), Tool::Ffmpeg);
        s.ffmpeg.latest = Some(release.tag.clone());
        s.ffmpeg.state = "up_to_date".into();
    });
    emit_status(app);

    Ok(format!("Updated ffmpeg to {}", release.tag))
}
```

Note: the old Task-3 `update_ffmpeg` tail (`meta.last_ffmpeg_check_day = Some(today_epoch_day()); meta.last_ffmpeg_tag = ...; save_meta(...)`) is fully replaced by the above — nothing remains to append.

- [ ] **Step 3: Add `run_launch_tasks`**

In `src-tauri/src/binaries.rs`:

```rust
pub async fn run_launch_tasks(app: AppHandle) {
    let _ = ensure_bootstrapped(&app);

    with_state(&app, |s| {
        s.ytdlp.installed = installed_version(&ytdlp_path(&app), Tool::YtDlp);
        s.ffmpeg.installed = installed_version(&ffmpeg_path(&app), Tool::Ffmpeg);
        if s.ytdlp.installed.is_some() {
            s.ytdlp.state = "up_to_date".into();
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
                    s.ytdlp.latest = match serde_json::to_string(&e) {
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
                with_state(&app, |s| { s.ffmpeg.state = "offline".into(); });
                emit_status(&app);
                let _ = e;
            }
        }
    }
}

fn truncate_status(s: String, max: usize) -> String {
    if s.len() <= max { s } else { format!("{}…", &s[..max]) }
}
```

Note: the canonical `update_ffmpeg` from Step 2 already records `last_ffmpeg_check_day` up front, so every outcome records the check — no further `update_ffmpeg` edits are needed in Step 3.

- [ ] **Step 4: Command wrappers in `update.rs` + new command registration**

Replace the entire `update_ytdlp` command in `src-tauri/src/commands/update.rs` with thin wrappers:

```rust
#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, AppError> {
    crate::binaries::update_ytdlp(&app).await
}

#[tauri::command]
pub async fn update_ffmpeg(app: AppHandle) -> Result<String, AppError> {
    crate::binaries::update_ffmpeg(&app).await
}

#[tauri::command]
pub fn binary_status(app: AppHandle, state: State<'_, crate::binaries::BinariesState>) -> crate::binaries::BinaryStatus {
    let _ = app;
    state.0.lock().unwrap().clone()
}
```

(`State` import: `use tauri::State;`.)

- [ ] **Step 5: Manage state + spawn launch tasks + register commands in `lib.rs`**

In `src-tauri/src/lib.rs`:

- Add `.manage(binaries::BinariesState::default())` after `.manage(active_processes)`.
- In `.setup`, add before `Ok(())`:

```rust
            let launch_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                binaries::run_launch_tasks(launch_handle).await;
            });
```

- Add to the `invoke_handler` array: `commands::update::binary_status,` and `commands::update::update_ffmpeg,`.

- [ ] **Step 6: `auto_update_ytdlp` default ON**

In `src-tauri/src/models/mod.rs:130`, change `auto_update_ytdlp: false,` → `auto_update_ytdlp: true,`.
In `src/stores/settings-store.ts:15`, change `auto_update_ytdlp: false,` → `auto_update_ytdlp: true,`.

- [ ] **Step 7: Frontend types + data service**

In `src/shared/lib/types.ts` append:

```ts
export interface ToolStatus {
  installed: string | null;
  latest: string | null;
  state: "up_to_date" | "updating" | "stale" | "failed" | "offline" | "missing";
}

export interface BinaryStatus {
  ytdlp: ToolStatus;
  ffmpeg: ToolStatus;
}
```

In `src/shared/lib/data-service.ts` add:

```ts
  async binaryStatus(): Promise<BinaryStatus> {
    return invoke<BinaryStatus>('binary_status');
  }
  async updateFfmpeg(): Promise<string> {
    return invoke<string>('update_ffmpeg');
  }
```

(and import `BinaryStatus` in the type import on line 2).

- [ ] **Step 8: Binary-status store**

Create `src/stores/binary-status-store.ts`:

```ts
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { dataService } from "@/shared/lib/data-service";
import type { BinaryStatus, ToolStatus } from "@/shared/lib/types";

const EMPTY: ToolStatus = { installed: null, latest: null, state: "missing" };

interface BinaryStatusStore {
  status: BinaryStatus;
  refresh: () => Promise<void>;
}

export const useBinaryStatusStore = create<BinaryStatusStore>((set) => ({
  status: { ytdlp: EMPTY, ffmpeg: EMPTY },
  refresh: async () => {
    try {
      const status = await dataService.binaryStatus();
      set({ status });
    } catch {
      // keep whatever we had
    }
  },
}));

listen<BinaryStatus>("binary-status", (e) => {
  useBinaryStatusStore.setState({ status: e.payload });
});
```

- [ ] **Step 9: Settings indicator + "Update now"**

In `src/features/settings/SettingsPage.tsx`:

- Imports: add

```tsx
import { useBinaryStatusStore } from "@/stores/binary-status-store";
```

- Helper function at the bottom of the file:

```tsx
function statusLabel(state: ToolStatus["state"]): string {
  switch (state) {
    case "up_to_date": return "up to date";
    case "updating": return "updating…";
    case "stale": return "update available";
    case "failed": return "update failed";
    case "offline": return "offline — using current";
    case "missing": return "not found";
  }
}

function formatVersion(t: ToolStatus): string {
  return t.installed ?? (t.latest ? `→ ${t.latest}` : "…");
}
```

(import `ToolStatus` from `@/shared/lib/types`.)

- Add to the `Download Defaults` card, after the `show_all_formats` toggle (line 47):

```tsx
<div className="border-t border-border pt-3">
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium">Download tools</span>
    <Button size="sm" variant="outline" onClick={async () => {
      await dataService.updateYtdlp().catch(() => {});
      await dataService.updateFfmpeg().catch(() => {});
      useBinaryStatusStore.getState().refresh();
    }}>
      Update now
    </Button>
  </div>
  <p className="text-xs text-muted-foreground mt-1">
    yt-dlp: v{formatVersion(ytdlp)} ({statusLabel(ytdlp.state)})
  </p>
  <p className="text-xs text-muted-foreground">
    ffmpeg: v{formatVersion(ffmpeg)} ({statusLabel(ffmpeg.state)})
  </p>
</div>
```

- In the `SettingsPage` component, before `return`, add:

```tsx
const binary = useBinaryStatusStore((s) => s.status);
const refreshBinary = useBinaryStatusStore((s) => s.refresh);

useEffect(() => {
  refreshBinary();
}, [refreshBinary]);
```

and define `const ytdlp = binary.ytdlp; const ffmpeg = binary.ffmpeg;`. (Add `import { useEffect, useState } from "react"` — already imported.)

- [ ] **Step 10: Kick the store refresh on load**

Wherever `loadSettings` is first called on app startup (e.g. in `src/App.tsx` / root layout), also run `useBinaryStatusStore.getState().refresh();`. If no such site exists, add a `useEffect` in `RootLayout`/`App`.

- [ ] **Step 11: Verify**

Run: `cargo build`, `npx tsc --noEmit`, `npm run build`
Expected: all pass. Then `npm run tauri dev`: Settings shows the two tool lines; yt-dlp downloads on launch; "Update now" refreshes state live.

- [ ] **Step 12: Commit**

```bash
git add src-tauri/src/binaries.rs src-tauri/src/commands/update.rs src-tauri/src/commands/settings.rs src-tauri/src/lib.rs src-tauri/src/models/mod.rs src/shared/lib/types.ts src/shared/lib/data-service.ts src/stores/binary-status-store.ts src/features/settings/SettingsPage.tsx src/App.tsx
git commit -m "feat: binary status indicator with launch-time yt-dlp/ffmpeg upkeep"
```

(If `App.tsx`/a layout file is the refresh mount site, adjust the path in the `git add`.)

---

### Task 5: Premiere toggle on the download page (remove dead settings toggle)

**Files:**
- Create: `src/features/download-options/PremiereSelector.tsx`
- Modify: `src/features/download-options/index.ts:5` (export)
- Modify: `src/pages/DownloadPage.tsx:92` (insert after `EncodingSelector`)
- Modify: `src/shared/lib/types.ts:75` (remove `auto_convert_premiere`)
- Modify: `src/stores/settings-store.ts:16` (remove `auto_convert_premiere`)
- Modify: `src/features/settings/SettingsPage.tsx:46` (remove the toggle line)
- Modify: `src-tauri/src/models/mod.rs:102` + `:131` (remove field + default)

**Interfaces:**
- Consumes: `useOptionsStore` `premiereMode`/`setPremiereMode` (already exist: `options-store.ts:11,18,29`); consumed downstream by `startDownload` (`download-execution-store.ts:72,88`) and the Rust pipeline (Converting stage already rendered by `DownloadProgress.tsx:72,94-96`).
- Produces: `<PremiereSelector />` export; downloads with the toggle ON go through the existing H.264/AAC conversion path.

- [ ] **Step 1: Create `PremiereSelector.tsx`**

```tsx
import { useOptionsStore } from "@/stores/options-store";
import { Label } from "@/components/ui/label";

export function PremiereSelector() {
  const premiereMode = useOptionsStore((s) => s.premiereMode);
  const setPremiereMode = useOptionsStore((s) => s.setPremiereMode);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">Premiere-compatible</Label>
      <button
        role="switch"
        aria-checked={premiereMode}
        onClick={() => setPremiereMode(!premiereMode)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-[inset_0_2px_5px_2px_var(--inset-highlight)] ${
          premiereMode ? "bg-accent" : "bg-surface-sunken"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-surface inset-highlight ring-0 transition-transform ${
            premiereMode ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
      <p className="text-xs text-muted-foreground">
        Re-encode to H.264/AAC after downloading for Adobe Premiere.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Export it**

In `src/features/download-options/index.ts`, add:

```ts
export { PremiereSelector } from './PremiereSelector';
```

- [ ] **Step 3: Mount it on the download page**

In `src/pages/DownloadPage.tsx:8`, add `PremiereSelector` to the import from `@/features/download-options`. Then in the options column (line 92), directly after `<EncodingSelector />`:

```tsx
<PremiereSelector />
```

- [ ] **Step 4: Remove the dead setting — frontend**

- `src/shared/lib/types.ts:75`: delete the `auto_convert_premiere: boolean;` line.
- `src/stores/settings-store.ts:16`: delete the `auto_convert_premiere: false,` line.
- `src/features/settings/SettingsPage.tsx:46`: delete the `auto_convert_premiere` `ToggleSetting` line.

- [ ] **Step 5: Remove the dead setting — Rust**

- `src-tauri/src/models/mod.rs:102`: delete `pub auto_convert_premiere: bool,`.
- `src-tauri/src/models/mod.rs:131`: delete `auto_convert_premiere: false,`.

(serde ignores unknown fields on read, so existing `settings.json` files that still contain `auto_convert_premiere` parse fine.)

- [ ] **Step 6: Verify**

Run: `cargo build` and `npx tsc --noEmit` and `npm run build`
Expected: all pass. Manual: analyze a URL → "Premiere-compatible" switch under Encoding; with it ON the download shows `downloading … (converting)` after download, then `downloaded`.

- [ ] **Step 7: Commit**

```bash
git add src/features/download-options/PremiereSelector.tsx src/features/download-options/index.ts src/pages/DownloadPage.tsx src/shared/lib/types.ts src/stores/settings-store.ts src/features/settings/SettingsPage.tsx src-tauri/src/models/mod.rs
git commit -m "feat: add premiere-compatible toggle to download page, drop dead setting"
```

---

### Task 6: Default download folder → Downloads\REEL

**Files:**
- Modify: `src-tauri/src/models/mod.rs:123-136` (default)
- Modify: `src-tauri/src/commands/settings.rs:11-24` (normalize empty stored value)

**Interfaces:**
- Consumes: `AppSettings::default`; `dirs::download_dir()`.
- Produces: fresh + existing (empty-stored) installs default to `<Downloads>\REEL`; user-chosen folders and per-download "Save To" override are untouched.

- [ ] **Step 1: Shared default helper**

In `src-tauri/src/models/mod.rs`, add above `impl Default for AppSettings`:

```rust
pub fn default_download_folder() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("C:\\Users\\dog\\Downloads"))
        .join("REEL")
        .to_string_lossy()
        .to_string()
}
```

Replace the `default_download_folder` assignment in `impl Default` (lines 126-129) with:

```rust
            default_download_folder: default_download_folder(),
```

- [ ] **Step 2: Normalize the persisted empty value**

In `src-tauri/src/commands/settings.rs`, change `get_settings` (lines 11-24) so a stored empty string falls back to the new default:

```rust
#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    let path = settings_path(&app);
    let mut settings = if let Ok(data) = std::fs::read_to_string(&path) {
        match serde_json::from_str::<AppSettings>(&data) {
            Ok(s) => s,
            Err(e) => {
                crate::logging::log_info(&format!("[get_settings] Failed to parse settings.json: {}. Using defaults.", e));
                AppSettings::default()
            }
        }
    } else {
        AppSettings::default()
    };
    if settings.default_download_folder.trim().is_empty() {
        settings.default_download_folder = crate::models::default_download_folder();
    }
    settings
}
```

- [ ] **Step 3: Verify**

Run: `cargo build`
Expected: passes. Manual: delete any `default_download_folder` value (or set it empty) in `%APPDATA%\com.dog.reel\settings.json`, relaunch → the "Save To" field shows `...\Downloads\REEL\<title>.mp4`; `verify_output_dir` passes because `download.rs:348` creates it on download.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/models/mod.rs src-tauri/src/commands/settings.rs
git commit -m "feat: default download folder to Downloads/REEL with empty-value fallback"
```

---

## Self-Review

**Spec coverage:**
- Binary bootstrapping + app-data bin + bundled fallback → Task 1, Task 2.
- yt-dlp every-launch update, silent non-blocking, SHA256 verify → Task 2 (retarget) + Task 4 (launch tasks).
- ffmpeg weekly opportunistic → Task 3 (+ `binaries-meta.json`).
- Async non-blocking launch, cached reuse → Task 4 `run_launch_tasks`.
- Settings version indicator + "Update now" → Task 4.
- Premiere page toggle, remove dead setting → Task 5.
- Downloads\REEL default + existing-empty normalization → Task 6.
- `--ffmpeg-location` H.265/merge fix → Task 2 Step 3.
- Bundled `externalBin`/`resources` unchanged → no task needed (explicitly out of scope).

**Placeholder scan:** All steps contain full code/commands. One caveat left to the implementer (Task 4 Step 10 mount point for `refresh()`) is resolved via a verification note, not a TODO.

**Type consistency:** `update_ytdlp`/`update_ffmpeg` defined in `binaries.rs` (Task 4) are what commands in `update.rs` and `run_launch_tasks` call; `ffmpeg_update_due` (Task 3) used in Task 4; `default_download_folder()` (Task 6) used by `get_settings`. `ToolStatus`/`BinaryStatus` names match between Rust (Step 1) and TS (Step 7). `fetch_latest_ffmpeg_release` (Task 3) is called by `binaries::update_ffmpeg`; both return or use `FfmpegRelease { tag, download_url }`. The Task-1 `_app_error_marker` was removed pre-flight — Task 3 adds `use crate::error::AppError;` when it is first used.