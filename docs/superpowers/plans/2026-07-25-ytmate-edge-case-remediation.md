# YTMate Edge-Case Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Companion to:** `docs/superpowers/plans/2026-07-21-ytmate-full-remediation.md`
> **Spec:** `docs/superpowers/specs/2026-07-25-ytmate-edge-case-remediation-design.md`
>
> Each phase below maps to the same-numbered phase in the companion plan. Work both plans' tasks within a phase before moving to the next.

**Goal:** Fix all 50+ edge-case items from EDGE_CASES.md by integrating into the existing 8-phase remediation plan plus Phase 9 (download execution).

**Architecture:** Targeted fixes across Rust backend (analyze.rs, download.rs, queue, settings, models, logging) and TypeScript frontend (stores, url-input, RangeSelector, download-progress, settings, playlist). Each fix is scoped to its owner phase.

**Tech Stack:** Rust (tokio, serde, thiserror, scopeguard), TypeScript/React 19, Zustand 5, Tauri v2, yt-dlp sidecar.

---

## Phase 1: Foundation — Shared Utilities & Dead Code Removal

### Task 1.1: Fix logger to persist debug in production (#14.3)

**Files:**
- Modify: `src/shared/lib/logger.ts`

**Interfaces:**
- Consumes: none
- Produces: `logger.debug()` writes to file in production builds

- [ ] **Remove the production debug guard**

```typescript
// Remove this guard entirely:
// if (!isDev && level === 'debug') return;
```

- [ ] **Add file-backed debug logging**

```typescript
// Replace with:
function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  // Always write debug to the dev console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta) fn(`${prefix} ${msg}`, meta);
  else fn(`${prefix} ${msg}`);

  // Route to Tauri log command for production persistence
  if (!isDev && level === 'debug') {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('log_to_file', { level, message: `${prefix} ${msg}`, meta: meta ? JSON.stringify(meta) : '' });
    }).catch(() => {}); // best-effort
  }
}
```

- [ ] **Add Rust `log_to_file` command** in `src-tauri/src/logging.rs` (already exists — add a public `log_to_file` function that appends to the log file with timestamp)
- [ ] **Register command** in `src-tauri/src/lib.rs`: `.invoke_handler(tauri::generate_handler![log_to_file])`
- [ ] **Verify** debug logs appear in `app_data_dir/ytmate.log` in production

### Task 1.2: Fix encoding key mismatch between frontend and backend (#3.3)

**Files:**
- Modify: `src-tauri/src/commands/download.rs:119-127`

- [ ] **Read current encoding match logic** to see the existing match arms
- [ ] **Add explicit match arms for frontend keys**

```rust
// In the encoding matching section:
let merge_format = match request.encoding.as_str() {
    "mp4_h264" => "mp4",
    "mp4_h265" => "mp4",  // same container, different postproc
    "mkv" => "mkv",
    "webm" => "webm",
    "m4a" => "m4a",
    "opus" => "opus",
    "flac" => "flac",
    "wav" => "wav",
    _ => "mp4",  // fallback for any future keys
};

let mut extra_ffmpeg_args: Vec<String> = vec![];
if request.encoding == "mp4_h265" {
    // Re-encode to H.265 via ffmpeg postprocessor
    extra_ffmpeg_args.extend_from_slice(&[
        "-c:v".into(), "libx265".into(),
        "-pix_fmt".into(), "yuv420p".into(),
    ]);
}
```

- [ ] **Wire `extra_ffmpeg_args` into the yt-dlp command** — append to the args list when encoding is `mp4_h265`
- [ ] **Verify** selecting "MP4 (H.265/HEVC)" in the UI adds `-c:v libx265` to the spawned yt-dlp command (check via log output)

---

## Phase 2: State Management Split

### Task 2.1: Migrate stores from sessionStorage to localStorage (#1.4)

**Files:**
- Modify: `src/stores/analysis-store.ts:156`
- Modify: `src/stores/download-execution-store.ts:277`
- Modify: `src/stores/options-store.ts:55`
- Modify: `src/stores/playlist-store.ts:74`

- [ ] **Change storage backend in all 4 stores**

```typescript
// Before:
storage: createJSONStorage(() => sessionStorage),
// After:
storage: createJSONStorage(() => localStorage),
```

- [ ] **Verify** analysis results survive app restart (close and reopen app, paste same URL — should hit analysis cache, not re-analyze)

### Task 2.2: Store quality by format_id, not label (#3.1)

**Files:**
- Modify: `src/stores/analysis-store.ts:144-146`
- Modify: `src/stores/analysis-store.ts:130-139`

- [ ] **Change selectedQuality default to empty string (format_id)**

```typescript
// In buildQualityOptions, instead of:
set({ selectedQuality: arr[0].label });
// Use:
const defaultFormatId = arr[0]?.value || '';
set({ selectedQuality: defaultFormatId });
```

- [ ] **Verify** that switching between two analyses with different formats doesn't silently default — `selectedQuality` stays as the format_id

### Task 2.3: Range slider reset on new video (#3.4)

**Files:**
- Modify: `src/features/download-options/RangeSelector.tsx`

- [ ] **Add reset effect for metadata changes**

```typescript
useEffect(() => {
  if (metadata) {
    prevMax.current = metadata.duration || 0;
    setStartTime(0);
    setEndTime(metadata.duration || 0);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [metadata?.id || metadata?.url]);  // key off identity, not just duration
```

- [ ] **Verify** pasting a new URL resets the range slider to full duration

### Task 2.4: timeToSeconds NaN guard (#3.5)

**Files:**
- Modify: `src/lib/utils.ts:26-31`

- [ ] **Add NaN validation**

```typescript
export function timeToSeconds(input: string): number {
  const parts = input.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}
```

- [ ] **Verify** typing "abc" in a time input defaults to 0 instead of NaN

### Task 2.5: TitleBar isMaximized reactive (#11.5)

**Files:**
- Modify: `src/components/layout/TitleBar.tsx`

- [ ] **Replace single mount call with Tauri window event listener**

```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    // Initial state
    win.isMaximized().then(setIsMaximized);
    // Listen for changes
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setIsMaximized);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);
  // ...rest of component uses isMaximized from state, not a one-time call
}
```

- [ ] **Verify** maximizing via Win+Arrow updates the icon immediately

---

## Phase 3: Architecture Reorganization

### Task 3.1: buildQualityOptions respect show_all_formats (#3.2)

**Files:**
- Modify: `src/stores/analysis-store.ts:130-139`
- Verify: `src-tauri/src/models/mod.rs:105-112` — confirm `show_all_formats` exists in `AppSettings`

- [ ] **Check AppSettings for show_all_formats field**

```rust
// In src-tauri/src/models/mod.rs, read the struct:
pub struct AppSettings {
    pub default_download_folder: Option<String>,
    pub auto_update_ytdlp: Option<bool>,
    pub auto_convert_premiere: Option<bool>,
    pub show_all_formats: Option<bool>,  // verify this exists
    // ...other fields
}
```

If missing, add it.

- [ ] **Read show_all_formats in buildQualityOptions**

```typescript
buildQualityOptions: (formats: FormatInfo[]) => {
  const showAll = false; // TODO: read from settings store
  const grouped = new Map<string, { value: string; label: string }>();

  if (showAll) {
    // No dedup — emit every format with full label
    const opts = formats.map(f => ({
      value: f.format_id,
      label: `${f.height ? `${f.height}p` : 'audio'} — ${f.codec || ''} ${f.filesize ? `(${(f.filesize / 1024 / 1024).toFixed(1)}MB)` : ''}`,
    }));
    set({ qualityOptions: opts, selectedQuality: opts[0]?.value || '' });
    return;
  }

  // Existing height-based dedup (keep current logic)
  for (const f of formats) {
    const key = f.height ? `${f.height}p` : 'audio';
    if (!grouped.has(key) || f.filesize > (formats.find(f2 => `${f2.height}p` === key)?.filesize ?? 0)) {
      const size = f.filesize ? ` (${(f.filesize / 1024 / 1024).toFixed(1)}MB)` : '';
      grouped.set(key, { value: f.format_id, label: `${key}${size}` });
    }
  }
  set({ qualityOptions: Array.from(grouped.values()) });
},
```

- [ ] **Verify** with `show_all_formats = true`, the quality selector shows 60fps and codec variants

### Task 3.2: URL history normalize tracking params (#1.3)

**Files:**
- Modify: `src/features/url-input/useUrlHistory.ts`

- [ ] **Add URL normalization helper**

```typescript
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip known tracking params
    const trackingParams = ['si', 'feature', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    trackingParams.forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url; // unparseable URLs pass through
  }
}
```

- [ ] **Use normalized URL for dedup key**

```typescript
addEntry: (url: string, title: string) => {
  const normalized = normalizeUrl(url);
  setHistory((prev) => {
    const filtered = prev.filter((e) => normalizeUrl(e.url) !== normalized);
    const next = [{ url, title, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
},
```

- [ ] **Verify** pasting same URL with `?si=abc` and `?feature=shared` produces one history entry

---

## Phase 4: Rust Backend Cleanup

### Task 4.1: URL validation before passing to yt-dlp (#1.1, #12.1)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`
- Modify: `src-tauri/src/error.rs` (if AppError exists; if not, create)

- [ ] **Add validate_url function**

```rust
fn validate_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL is empty".into());
    }
    // Must be http or https
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".into());
    }
    // Must have a valid domain (basic check)
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
```

- [ ] **Insert validation at top of analyze_video**

```rust
#[tauri::command]
async fn analyze_video(app: tauri::AppHandle, url: String) -> Result<AnalyzeResponse, AppError> {
    validate_url(&url).map_err(|e| AppError::InvalidUrl(e))?;
    // ...existing code...
}
```

- [ ] **Add InvalidUrl variant to AppError**

```rust
#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    // ...existing variants...
}
```

- [ ] **Verify** `file:///etc/passwd` and `javascript:alert(1)` show "Invalid URL" instead of passing to yt-dlp

### Task 4.2: Strict UTF-8 parsing (#2.1)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`

- [ ] **Replace from_utf8_lossy with strict from_utf8**

```rust
// Before:
let stdout = String::from_utf8_lossy(&output.stdout);
// After:
let stdout = String::from_utf8(output.stdout)
    .map_err(|e| AppError::InvalidUtf8(e.to_string()))?;
```

- [ ] **Add Utf8Error variant to AppError**

```rust
#[error("Invalid UTF-8 in yt-dlp output: {0}")]
InvalidUtf8(String),
```

- [ ] **Verify** corrupt output produces a clear error message

### Task 4.3: Surface missing JSON fields as errors (#2.2)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`

- [ ] **Replace critical field unwrap_or with ok_or**

```rust
// Before:
let title: String = json["title"].as_str().unwrap_or("Unknown").to_string();
// After:
let title: String = json["title"]
    .as_str()
    .ok_or_else(|| AppError::MissingField("title".into()))?
    .to_string();
```

- [ ] **Apply to: title, duration, webpage_url**

```rust
let title = json["title"].as_str().ok_or(AppError::MissingField("title"))?.to_string();
let duration = json["duration"].as_f64().ok_or(AppError::MissingField("duration"))?;
let webpage_url = json["webpage_url"].as_str().ok_or(AppError::MissingField("webpage_url"))?.to_string();
```

- [ ] **Keep unwrap_or for non-critical fields** (channel, thumbnail) but add a log warning
- [ ] **Add MissingField variant to AppError**

```rust
#[error("Missing required field in yt-dlp response: {0}")]
MissingField(String),
```

- [ ] **Verify** analysis of a members-only video (missing title) shows "Missing required field: title" instead of "Unknown"

### Task 4.4: Fix single-entry playlist detection (#2.3)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`

- [ ] **Fix the playlist detection logic**

```rust
// Before:
if entries.len() > 1 { is_playlist = true; }
// After:
if entries.len() >= 1 {
    is_playlist = true;
    // Also need formats from first entry for non-flat analysis
    if let Some(first) = entries.first() {
        // Extract formats from first entry if available
        formats = extract_formats(first);
    }
}
```

- [ ] **Also fix the comment/condition at line 193-194** — change `entries.len() > 1` to `entries.len() >= 1`
- [ ] **Verify** a playlist URL with exactly 1 entry shows playlist UI (PlaylistSelector) instead of single-video UI

### Task 4.5: Thumbnail URL validation (#2.4)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`

- [ ] **Add YouTube video ID validation**

```rust
fn extract_thumbnail(data: &serde_json::Value, url: &str) -> Option<String> {
    // Try direct thumbnail field first
    if let Some(thumb) = data["thumbnail"].as_str() {
        if !thumb.is_empty() {
            return Some(thumb.to_string());
        }
    }
    // Try constructing from video ID
    let video_id = data["id"].as_str().or_else(|| {
        // Extract from URL: match v= parameter
        url.split('?').nth(1)?.split('&')
            .find_map(|p| p.strip_prefix("v="))
    })?;
    // Validate YouTube video ID format: 11 alphanumeric chars including - and _
    if video_id.len() == 11 && video_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Some(format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", video_id))
    } else {
        None  // Invalid ID, return None instead of broken URL
    }
}
```

- [ ] **Verify** non-YouTube URLs produce no thumbnail (UI shows fallback icon)

### Task 4.6: Filesize estimation from bitrate (#2.5)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`

- [ ] **Add bitrate-based fallback for filesize**

```rust
let filesize = fmt["filesize"].as_u64()
    .or_else(|| fmt["filesize_approx"].as_u64())
    .or_else(|| {
        // Estimate from bitrate × duration
        let tbr = fmt["tbr"].as_f64().or_else(|| fmt["vbr"].as_f64())?;
        let duration = data["duration"].as_f64()?;
        if tbr > 0.0 && duration > 0.0 {
            Some((tbr * duration / 8.0) as u64)  // tbr is kbps, /8 to get KB
        } else {
            None
        }
    });
```

- [ ] **In the format output, mark estimated sizes** — pass a flag or format the label differently
- [ ] **Verify** DASH formats without filesize display "~123 MB" instead of empty

### Task 4.7: Resolution from format_note normalization (#2.6)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`

- [ ] **Add format_note normalization**

```rust
fn normalize_resolution(note: &str) -> Option<u32> {
    let note = note.trim();
    // Handle "720p60", "1080p60" → extract "720", "1080"
    if let Some(p) = note.strip_suffix("p").or_else(|| note.strip_suffix("p60")) {
        return p.parse::<u32>().ok();
    }
    // Handle "hd720" → 720, "hd1080" → 1080
    if let Some(hd) = note.strip_prefix("hd") {
        return hd.parse::<u32>().ok();
    }
    // Handle "medium" → 480
    match note {
        "medium" => Some(480),
        "small" => Some(360),
        "tiny" => Some(144),
        _ => None,
    }
}

// Usage in resolution parsing:
let height = fmt["height"].as_u64()
    .or_else(|| fmt["format_note"].as_str().and_then(normalize_resolution).map(u64::from));
```

- [ ] **Verify** "720p60" format maps to the "720p" quality bucket

### Task 4.8: Empty playlist detection (#2.8)

**Files:**
- Modify: `src-tauri/src/commands/analyze.rs`

- [ ] **Add empty array check after entries parsing**

```rust
if let Some(entries) = json["entries"].as_array() {
    if entries.is_empty() {
        return Err(AppError::EmptyPlaylist);
    }
    is_playlist = entries.len() >= 1;
    // ...existing code...
}
```

- [ ] **Add EmptyPlaylist variant to AppError**

```rust
#[error("The playlist is empty")]
EmptyPlaylist,
```

- [ ] **Verify** playlist URL with 0 videos shows "The playlist is empty" error

### Task 4.9: Queue schema mismatch logging (#7.4)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Add version mismatch logging and migration attempt**

```rust
fn load_saved_queue(path: &Path) -> Vec<DownloadItem> {
    let data = match std::fs::read_to_string(path) {
        Ok(d) => d,
        Err(_) => return vec![],
    };
    let parsed: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("Failed to parse queue.json, starting fresh: {}", e);
            return vec![];
        }
    };
    let version = parsed["version"].as_u64().unwrap_or(0);
    if version != QUEUE_SCHEMA_VERSION {
        log::warn!(
            "Queue schema version mismatch: file={}, current={}. Attempting migration...",
            version, QUEUE_SCHEMA_VERSION
        );
        // Attempt to parse with current schema (forward-compatible fields)
        if let Ok(items) = serde_json::from_value::<Vec<DownloadItem>>(parsed["items"].clone()) {
            log::info!("Queue parsed with {} items despite version mismatch", items.len());
            return items;
        }
        log::warn!("Failed to migrate queue — starting fresh");
        return vec![];
    }
    serde_json::from_value(parsed["items"]).unwrap_or_default()
}
```

- [ ] **Verify** after a schema version bump, the old queue is logged and attempted to migrate, not silently discarded

### Task 4.10: Settings parse error logging (#7.6)

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`

- [ ] **Replace unwrap_or_default with logged match**

```rust
// Before:
serde_json::from_str(&data).unwrap_or_default()
// After:
match serde_json::from_str::<AppSettings>(&data) {
    Ok(s) => s,
    Err(e) => {
        log::warn!("Failed to parse settings.json: {}. Using defaults.", e);
        AppSettings::default()
    }
}
```

- [ ] **Verify** a corrupted `settings.json` logs a warning instead of silently resetting

### Task 4.11: Update integrity with hash verification (#9.2)

**Files:**
- Modify: `src-tauri/src/commands/update.rs`

- [ ] **Fetch latest release metadata from GitHub API**

```rust
async fn fetch_latest_release() -> Result<(String, String, Option<String>), AppError> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .header("User-Agent", "ytmate/0.1")
        .send()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    let json: serde_json::Value = resp.json().await.map_err(|e| AppError::NetworkError(e.to_string()))?;
    let tag = json["tag_name"].as_str().unwrap_or("latest").to_string();
    let download_url = json["assets"].as_array()
        .and_then(|assets| assets.iter().find(|a| {
            a["name"].as_str().map(|n| n.contains("yt-dlp.exe")).unwrap_or(false)
        }))
        .and_then(|a| a["browser_download_url"].as_str().map(String::from))
        .ok_or_else(|| AppError::NetworkError("Download URL not found".into()))?;
    // Try to get SHA256 hash from release body
    let body = json["body"].as_str().unwrap_or("");
    let hash = body.lines()
        .find(|l| l.contains("SHA256") || l.contains("sha256"))
        .and_then(|l| l.split_whitespace().find(|w| w.len() == 64 && w.chars().all(|c| c.is_ascii_hexdigit())))
        .map(String::from);
    Ok((tag, download_url, hash))
}
```

- [ ] **Add temp file + atomic rename pattern**

```rust
async fn update_ytdlp(app: &tauri::AppHandle) -> Result<String, AppError> {
    let (_tag, download_url, expected_hash) = fetch_latest_release().await?;
    let binary_path = app.path().resource_dir()
        .map_err(|e| AppError::StorageError(e.to_string()))?
        .join("binaries")
        .join("yt-dlp-x86_64-pc-windows-msvc.exe");

    // Download to temp file
    let tmp_path = binary_path.with_extension("exe.tmp");
    let response = reqwest::get(&download_url).await.map_err(|e| AppError::NetworkError(e.to_string()))?;
    let bytes = response.bytes().await.map_err(|e| AppError::NetworkError(e.to_string()))?;

    // Verify checksum if available
    if let Some(hash) = expected_hash {
        use sha2::{Sha256, Digest};
        let actual = hex::encode(Sha256::digest(&bytes));
        if actual != hash {
            return Err(AppError::NetworkError(format!("SHA256 mismatch: expected {}, got {}", hash, actual)));
        }
    } else {
        // Fallback: verify PE magic bytes
        if bytes.len() < 2 || bytes[0] != b'M' || bytes[1] != b'Z' {
            return Err(AppError::NetworkError("Downloaded file is not a valid PE executable".into()));
        }
    }

    // Atomic replace
    tokio::fs::write(&tmp_path, &bytes).await.map_err(|e| AppError::StorageError(e.to_string()))?;
    // Backup current binary
    if binary_path.exists() {
        let backup = binary_path.with_extension("exe.bak");
        tokio::fs::rename(&binary_path, &backup).await.ok();
    }
    tokio::fs::rename(&tmp_path, &binary_path).await.map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok("Update successful".into())
}
```

- [ ] **Update Cargo.toml** — add `reqwest`, `sha2`, `hex` dependencies
- [ ] **Verify** a failed/interrupted update doesn't leave a truncated exe (the backup restores)

### Task 4.12: SSRF mitigation (#12.1)

Already covered by Task 4.1 (URL validation rejects non-http(s) schemes).

### Task 4.13: Path traversal in sanitize_filename (#4.3, #12.2)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Rewrite sanitize_filename with comprehensive filtering**

```rust
fn sanitize_filename(name: &str) -> String {
    // Apply Unicode normalization
    let name = name.nfc().collect::<String>();
    let mut sanitized: Vec<char> = Vec::with_capacity(name.len());
    for c in name.chars() {
        match c {
            // Strip null and control characters
            '\0' | '\x01'..='\x1F' => continue,
            // Replace path separators and reserved chars
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => {
                sanitized.push('_');
            }
            // All other characters pass through
            _ => sanitized.push(c),
        }
    }
    // Collapse consecutive underscores
    let mut result: String = sanitized.iter().collect();
    while result.contains("__") {
        result = result.replace("__", "_");
    }

    // Strip leading dots and path components
    while result.starts_with('.') || result.starts_with("..") {
        result = result.trim_start_matches('.').trim_start_matches("..").to_string();
    }

    // Truncate at 200 bytes respecting UTF-8 char boundaries
    if result.len() > 200 {
        let mut boundary = 200;
        while !result.is_char_boundary(boundary) {
            boundary -= 1;
        }
        result.truncate(boundary);
    }

    result
}
```

- [ ] **Add `unicode-normalization` crate to Cargo.toml** (for `.nfc()`)
- [ ] **Verify** a video titled `../../malicious` becomes `_malicious.mp4`

### Task 4.14: Output directory validation (#12.3)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Add absolute path check**

```rust
// After receiving output_dir from frontend:
let output_path = Path::new(&request.output_dir);
if !output_path.is_absolute() {
    return Err(AppError::InvalidPath("Output directory must be an absolute path".into()));
}
```

- [ ] **Verify** a relative path shows a clear error

### Task 4.15: ISO 8601 timestamps in logs (#14.1)

**Files:**
- Modify: `src-tauri/src/logging.rs`

- [ ] **Replace epoch seconds with ISO 8601**

```rust
use chrono::Local;

// In the log write function:
fn format_timestamp() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S%z").to_string()
}
```

- [ ] **Add `chrono` crate to Cargo.toml** (feature `serde` if needed)
- [ ] **Verify** log lines show "2026-07-25T12:00:00+0530" instead of "1787654400"

### Task 4.16: Log file handle reconnection (#14.2)

**Files:**
- Modify: `src-tauri/src/logging.rs`

- [ ] **Add lock contention handling with cooldown**

```rust
use std::time::{Duration, Instant};

fn write_log(entry: &str) {
    let mut last_attempt = Instant::now();
    let cooldown = Duration::from_secs(5);

    match LOG_FILE.lock() {
        Ok(mut file) => {
            if let Err(e) = writeln!(file, "{}", entry) {
                eprintln!("Failed to write log: {}", e);
            }
            last_attempt = Instant::now();
        }
        Err(_) => {
            // Log to stderr as fallback
            eprintln!("{}", entry);
            // Reconnection: attempt to reopen the log file on cooldown expiry
            if last_attempt.elapsed() >= cooldown {
                if let Ok(new_file) = std::fs::OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open("ytmate.log")
                {
                    *LOG_FILE.lock().unwrap_or_else(|e| e.into_inner()) = new_file;
                }
                last_attempt = Instant::now();
            }
        }
    }
}
```

- [ ] **Verify** after a transient lock contention, log entries resume going to the file

### Task 4.17: CSP non-null (#12.4)

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Replace null CSP with restricted policy**

```json
{
  "csp": "default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline';"
}
```

- [ ] **Verify** the app loads correctly (images from HTTPS load, inline styles from Tailwind work)

---

## Phase 5: UX and Interaction Improvements

### Task 5.1: canDownload output directory verification (#11.1)

**Files:**
- Modify: `src/pages/DownloadPage.tsx`
- Modify: `src/shared/lib/data-service.ts`

- [ ] **Add verifyOutputDir Tauri command**

```rust
// In src-tauri/src/commands/download.rs or a new commands/fs.rs:
#[tauri::command]
async fn verify_output_dir(path: String) -> Result<bool, ()> {
    Ok(std::path::Path::new(&path).exists())
}
```

- [ ] **Add frontend check in computed canDownload**

```typescript
const [dirExists, setDirExists] = useState(true);

useEffect(() => {
  if (effectiveDir) {
    dataService.verifyOutputDir(effectiveDir).then(setDirExists);
  }
}, [effectiveDir]);

const canDownload = phase === "ready" && !!effectiveDir && dirExists && !!selectedQuality && !isDownloading;
```

- [ ] **Verify** clicking Download with a removed USB drive shows "Output directory not found"

### Task 5.2: Empty formats state (#11.2)

**Files:**
- Modify: `src/pages/DownloadPage.tsx`

- [ ] **Add empty-formats check after analysis**

```typescript
// After phase becomes "ready":
const hasFormats = qualityOptions.length > 0;

{phase === "ready" && !hasFormats && (
  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
    <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">No downloadable formats found</p>
    <p className="text-xs text-muted-foreground mt-1">
      This video may be a livestream, members-only, or geo-blocked. Try a different URL.
    </p>
  </div>
)}
```

- [ ] **Verify** a video with no available formats shows a helpful message, not a blank page

### Task 5.3: Conditional history polling (#11.3)

**Files:**
- Modify: `src/pages/DownloadsPage.tsx`
- Modify: `src/features/download-history/HistoryPanel.tsx`

- [ ] **Add active-download check and adaptive polling**

```typescript
function useQueuePolling(intervalMs = 2000) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const hasActive = queue.some(item => item.status === 'Downloading' || item.status === 'Queued');

  useEffect(() => {
    const poll = async () => {
      const items = await dataService.getQueue();
      setQueue(items);
    };
    poll(); // immediate first fetch
    const id = setInterval(poll, hasActive ? 2000 : 30_000);
    return () => clearInterval(id);
  }, [hasActive]);

  return queue;
}
```

- [ ] **Verify** with no active downloads, the queue is polled every 30s instead of every 2s

### Task 5.4: "starting..." timeout guard (#11.4)

**Files:**
- Modify: `src/features/download-execution/DownloadProgress.tsx`

- [ ] **Add timeout for stuck starting state**

```typescript
const [stuck, setStuck] = useState(false);

useEffect(() => {
  if (!downloadItem && isDownloading) {
    const timer = setTimeout(() => setStuck(true), 5000);
    return () => clearTimeout(timer);
  } else {
    setStuck(false);
  }
}, [downloadItem, isDownloading]);

if (!downloadItem && isDownloading) {
  if (stuck) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-destructive">Download may have failed to start</p>
        <button onClick={retry} className="text-sm text-primary underline mt-1">Retry</button>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">Starting download...</p>;
}
```

- [ ] **Verify** if enqueue fails silently, the UI shows "Download may have failed" within 5s

### Task 5.5: Clean error state on analyze failure (#13.1)

**Files:**
- Modify: `src/stores/analysis-store.ts`

- [ ] **Ensure error path resets state**

```typescript
analyzeUrl: async (inputUrl?: string) => {
    const url = (inputUrl ?? get().url).trim();
    if (!url) return;
    const gen = ++analyzeGen;
    set({ phase: 'analyzing', error: null, metadata: null, formats: [], qualityOptions: [], playlistEntries: [] });
    try {
      const result = await dataService.analyzeVideo(url);
      if (gen !== analyzeGen) return;
      // ...success path...
    } catch (e) {
      if (gen !== analyzeGen) return;
      set({ phase: 'error', error: String(e), metadata: null, formats: [], qualityOptions: [], playlistEntries: [] });
    }
  },
```

- [ ] **Verify** after an error, all state is clean and retry works without leftover data

### Task 5.6: Idempotent event listener cleanup (#13.2)

**Files:**
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Use ref-based idempotent registration**

```typescript
private unlistenRef: (() => void) | null = null;

initProgressListener: async () => {
  // Unregister existing listener first (idempotent)
  if (get().unlistenRef) {
    try {
      get().unlistenRef!();
    } catch (e) {
      logger.warn('Failed to unregister stale listener', { error: e });
    }
    get().unlistenRef = null;
  }

  const unlistenProgress = await listen<ProgressPayload>('download-progress', (event) => {
    set({
      downloadProgress: event.payload.progress,
      downloadSpeed: event.payload.speed,
      downloadEta: event.payload.eta,
      downloadStatus: event.payload.status,
    });
  });
  const unlistenItem = await listen<DownloadItem>('download-item-update', (event) => {
    set({ downloadItem: event.payload });
  });

  const cleanup = () => {
    unlistenProgress();
    unlistenItem();
    set({ unlistenRef: null });
  };
  set({ unlistenRef: cleanup });
  return cleanup;
},
```

- [ ] **Verify** React StrictMode double-mount doesn't cause duplicate event processing

### Task 5.7: Playlist cancel uses download UUID not URL (#5.1)

**Files:**
- Modify: `src/stores/playlist-store.ts`
- Modify: `src/features/playlist/PlaylistSelector.tsx`
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Add downloadId to PlaylistEntry interface**

```typescript
interface PlaylistEntry {
  id: string;       // video URL (from analysis)
  downloadId: string; // UUID from enqueue_download (empty until download starts)
  title: string;
  duration: number;
  thumbnail: string;
  url: string;
}
```

- [ ] **Store downloadId when each playlist item starts**

```typescript
// In download-execution-store.ts, when enqueueing playlist items:
const result = await dataService.enqueueDownload(request);
usePlaylistStore.getState().setItemDownloadId(idx, result.id);
```

- [ ] **Update cancel button to use downloadId**

```typescript
// In PlaylistSelector.tsx:
<button onClick={() => dataService.cancelDownload(entry.downloadId)}>
  Cancel
</button>
```

- [ ] **Verify** clicking cancel on a playlist item actually stops the download

---

## Phase 6: Visual Design Overhaul

No edge-case items to add.

---

## Phase 7: Performance and Robustness

### Task 7.1: Retry backoff (#4.5)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Add exponential backoff between retries**

```rust
// In the retry loop:
'retry: for attempt in 0..max_attempts {
    if attempt > 0 {
        let delay = Duration::from_secs(2u64.pow(attempt)); // 2s, 4s, 8s...
        tokio::time::sleep(delay).await;
    }
    // ...existing download logic...
}
```

- [ ] **Also handle thumbnail fallback visibly (#4.6)**

```rust
// When attempt > 0 and embed_thumbnail was disabled:
if attempt > 0 {
    // Emit a progress event with a note about thumbnail being skipped
    emit_progress(&app, &id, progress, &speed, &eta, "Downloading (no thumbnail)");
}
```

- [ ] **Verify** retries wait 2s, then 4s, instead of firing immediately

### Task 7.2: Locale-safe progress regex (#10.1)

**Files:**
- Modify: `src-tauri/src/models/progress.rs`

- [ ] **Accept comma as decimal separator**

```rust
// Before:
lazy_static! {
    static ref PROGRESS_RE: Regex = Regex::new(r"(\d+\.?\d*)%").unwrap();
}
// After:
lazy_static! {
    static ref PROGRESS_RE: Regex = Regex::new(r"(\d+[.,]?\d*)%").unwrap();
}

// In parse function:
fn parse_progress(line: &str) -> Option<f64> {
    PROGRESS_RE.captures(line)?.get(1)?.as_str()
        .replace(',', ".")  // Normalize comma to dot
        .parse::<f64>()
        .ok()
}
```

- [ ] **Verify** progress lines with "1,5%" (Italian locale) parse correctly

### Task 7.3: Clamp progress at 100% (#10.2)

**Files:**
- Modify: `src-tauri/src/commands/download.rs` (emit_progress function)

```rust
fn emit_progress(app: &tauri::AppHandle, id: &str, progress: f64, speed: &str, eta: &str, status: &str) {
    let clamped = progress.clamp(0.0, 100.0);
    // ...emit with clamped value...
}
```

- [ ] **Verify** progress display never shows "105%"

### Task 7.4: Emit final 100% on download completion (#10.3)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Emit final progress after download loop exits**

```rust
// After the yt-dlp output streaming loop (before ffmpeg conversion):
emit_progress(&app, &id, 100.0, &speed, &eta, "Processing");

// ...ffmpeg conversion...
// After conversion completes:
emit_progress(&app, &id, 100.0, "", "", "Completed");
```

- [ ] **Verify** download completes with progress showing 100%, not an intermediate throttled value

---

## Phase 8: Settings and History

### Task 8.1: filenamePattern persists to backend (#7.5)

**Files:**
- Modify: `src-tauri/src/models/mod.rs` — add `filename_pattern` to AppSettings
- Modify: `src-tauri/src/commands/download.rs` — pass pattern to yt-dlp --output template

- [ ] **Add filename_pattern to AppSettings**

```rust
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppSettings {
    pub default_download_folder: Option<String>,
    pub auto_update_ytdlp: Option<bool>,
    pub auto_convert_premiere: Option<bool>,
    pub show_all_formats: Option<bool>,
    pub filename_pattern: Option<String>,
    // ...existing fields...
}
```

- [ ] **Pass pattern to yt-dlp, but sanitize resolved filenames — not the template**

```rust
// In process_download, when building yt-dlp args:
let output_template = settings.filename_pattern
    .as_ref()
    .filter(|p| !p.is_empty())
    .map(|p| format!("{}/{}", output_dir, p))
    .unwrap_or_else(|| format!("{}/{}", output_dir, "%(title)s.%(ext)s"));

// The template itself contains yt-dlp syntax like %(title)s — do NOT sanitize it.
// After download, when resolving the actual filename, sanitize the resolved value
// using sanitize_filename from Task 4.13 before the file is written.
cmd.arg("-o").arg(&output_template);
```

- [ ] **Verify** a filename pattern like `%(title)s - %(uploader)s.%(ext)s` works, and `../../escape` resolves to a safe path

### Task 8.2: Playlist entry metadata (#5.5)

**Files:**
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Populate channel and thumbnail for playlist entries**

```typescript
// When creating download items for playlist entries:
const item: DownloadRequest = {
  url: entry.url,
  title: entry.title || 'Unknown',
  channel: entry.channel || '',  // populated from analysis if available
  format_id: formatId,
  output_dir: outputDir,
  filename: safeFilename,
  thumbnail_url: entry.thumbnail || '',  // from extract_thumbnail or empty
  duration: entry.duration || 0,
  // ...other fields...
};
```

- [ ] **Verify** playlist items in the queue show channel name and thumbnail

---

## Phase 9: Download Execution & Critical Fixes

### Task 9A: Retry thumbnail fallback visible to user (#4.6)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Emit distinct status when thumbnail is skipped on retry**

```rust
// In the retry loop setup:
let embed_thumbnail = attempt == 0; // Only embed on first attempt

// When emitting progress during retry:
if attempt > 0 {
    emit_progress(&app, &id, progress, &speed, &eta, "Retrying (no thumbnail)");
}
```

- [ ] **Verify** on retry, the UI shows "Retrying (no thumbnail)" — already covered by Task 7.1

### Task 9B: Cancel from DownloadsPage race (#8.4)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`
- Modify: `src-tauri/src/queue/mod.rs`

- [ ] **Add pre-emptive cancellation via queue status**

```rust
// In cancel_download, set queue status BEFORE trying to kill the process:
fn cancel_download(id: &str, queue: &Arc<Mutex<DownloadQueue>>, active: &Arc<Mutex<HashMap<String, CommandChild>>>) {
    // 1. Set status in queue first
    if let Ok(mut q) = queue.lock() {
        if let Some(item) = q.items.iter_mut().find(|i| i.id == id) {
            item.status = "Cancelled".to_string();
        }
    }
    // 2. Kill process if running
    if let Ok(mut map) = active.lock() {
        if let Some(child) = map.remove(id) {
            let _ = child.kill();
        }
    }
    save_queue(queue);
}

// In the spawned task before calling process_download:
let should_abort = queue.lock()
    .map(|q| q.items.iter().any(|i| i.id == item_id && i.status == "Cancelled"))
    .unwrap_or(false);
if should_abort {
    return; // Skip this download
}
```

- [ ] **Verify** clicking cancel immediately after enqueue doesn't result in a download starting

### Task 9C: cancel_all misses queued items (#8.5)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Add cancellation token for spawn loop**

```rust
// Add a module-level cancellation flag:
static CANCELLATION_TOKEN: AtomicBool = AtomicBool::new(false);

fn cancel_all_downloads(queue: &Arc<Mutex<DownloadQueue>>, active: &Arc<Mutex<HashMap<String, CommandChild>>>) {
    // Set global cancellation flag
    CANCELLATION_TOKEN.store(true, Ordering::SeqCst);

    // Kill active processes
    if let Ok(mut map) = active.lock() {
        for (_, child) in map.drain() {
            let _ = child.kill();
        }
    }

    // Mark all as cancelled
    if let Ok(mut q) = queue.lock() {
        for item in q.items.iter_mut() {
            if item.status == "Queued" || item.status == "Downloading" {
                item.status = "Cancelled".to_string();
            }
        }
    }
    save_queue(queue);

    // Reset token after a short delay (to let in-flight spawns check)
    tokio::spawn(async {
        tokio::time::sleep(Duration::from_millis(500)).await;
        CANCELLATION_TOKEN.store(false, Ordering::SeqCst);
    });
}

// In enqueue_download's spawn:
tokio::spawn(async move {
    if CANCELLATION_TOKEN.load(Ordering::SeqCst) {
        return; // Download was cancelled before it started
    }
    process_download(...).await;
});
```

- [ ] **Verify** cancelling all stops items that haven't begun processing yet

### Task 9D: Dynamic extension for premiere mode input path (#6.1)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Pass extension through pipeline instead of scanning disk**

```rust
// In the download request struct, add an `ext` field:
pub struct DownloadRequest {
    pub url: String,
    pub format_id: String,
    pub output_dir: String,
    pub filename: String,
    pub ext: String,  // "mp4", "mkv", "webm" — from encoding config
    pub premiere_mode: bool,
    // ...existing fields...
}

// In process_download, use ext for input path:
if premiere_mode {
    let input_path = format!("{}/{}.{}", output_dir, safe_filename, request.ext);
    // ...use input_path with ffmpeg...
}
```

- [ ] **Populate ext from frontend at enqueue time**

```typescript
// In download-execution-store.ts:
const ext = encodingConfig.video.find(e => e.key === encoding)?.ext || 'mp4';
await dataService.enqueueDownload({ ...request, ext });
```

- [ ] **Verify** premiere mode with MKV encoding finds the correct input file

### Task 9E: Atomic delete-before-rename (#6.2)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Swap to rename-then-delete pattern**

```rust
// After ffmpeg conversion completes:
let temp_path = format!("{}/{}.converted.{}", output_dir, safe_filename, ext);
let final_path = format!("{}/{}.{}", output_dir, safe_filename, ext);

// 1. Rename converted file to final location (overwrites if exists)
match std::fs::rename(&temp_path, &final_path) {
    Ok(_) => {
        // 2. Only now delete the original yt-dlp output
        let original_path = format!("{}/{}.{}", output_dir, safe_filename, ext); // or the actual original name
        let _ = std::fs::remove_file(&original_path);
    }
    Err(e) => {
        // Rename failed — restore original, remove temp
        log::error!("Failed to rename converted file: {}", e);
        let _ = std::fs::remove_file(&temp_path);
        // Original yt-dlp output is still intact
    }
}
```

- [ ] **Verify** if rename fails (disk full, AV scan), the original downloaded file is not deleted

### Task 9F: Temp file cleanup on ffmpeg failure (#6.3)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`
- Modify: `src-tauri/Cargo.toml` — add `scopeguard` dependency

- [ ] **Add scopeguard for cleanup**

```toml
# Cargo.toml
[dependencies]
scopeguard = "1.2"
```

```rust
use scopeguard::defer;

// In the ffmpeg conversion section:
{
    let output_path_clone = output_path.clone();
    defer! {
        // Cleanup on any exit from this block (including Err)
        let _ = std::fs::remove_file(&output_path_clone);
        let _ = std::fs::remove_file(&temp_path);
    }

    match ffmpeg_output.await {
        Ok(_) => {
            // Success — cleanup is skipped since defer runs, but we want to keep files
            // Clear the defer by cancelling it
            scopeguard::unprotected(&mut ());
        }
        Err(e) => {
            // defer! will clean up automatically
            log::error!("ffmpeg conversion failed: {}", e);
            break 'retry; // Item stays in "Converting" — will be marked Failed below
        }
    }
}
```

- [ ] **Verify** if ffmpeg crashes mid-conversion, orphaned partial files are cleaned up

### Task 9G: FFmpeg progress emission + error handling (#6.4, #9.4)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Emit ffmpeg conversion progress**

```rust
// In the ffmpeg output reader:
let total_duration = request.duration;  // Pass duration in the request
let ffmpeg_re = Regex::new(r"time=(\d+):(\d+):(\d+\.\d+)").unwrap();

// When reading ffmpeg stderr:
if let Some(caps) = ffmpeg_re.captures(&text) {
    let h: f64 = caps[1].parse().unwrap_or(0.0);
    let m: f64 = caps[2].parse().unwrap_or(0.0);
    let s: f64 = caps[3].parse().unwrap_or(0.0);
    let elapsed = h * 3600.0 + m * 60.0 + s;
    let pct = if total_duration > 0.0 {
        (elapsed / total_duration * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    emit_progress(&app, &id, pct, "", "", "Converting");
}
```

- [ ] **Mark item Failed on ffmpeg spawn error instead of stuck Converting**

```rust
// In the ffmpeg spawn error path:
let ffmpeg_result = ffmpeg_output.await;
match ffmpeg_result {
    Ok(_) => { /* success */ }
    Err(e) => {
        log::error!("ffmpeg conversion failed: {}", e);
        // Mark item as Failed with error message
        emit_item_update(&app, &id, DownloadStatus::Failed(format!("FFmpeg error: {}", e)));
        break 'retry; // Exit retry loop
    }
}
```

- [ ] **Verify** ffmpeg progress shows in the UI during conversion, and ffmpeg failure transitions to "Failed" instead of stuck "Converting"

### Task 9H: Premiere audio mode guard (#6.5)

No change needed — the `if premiere_mode && download_type == DownloadType::Video` guard is correct.

### Task 9I: Cancel race with process_download (#8.1)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Add atomic cancellation flag shared between cancel_download and process_download**

```rust
// Replace the HashMap<String, CommandChild> with HashMap<String, DownloadHandle>:
struct DownloadHandle {
    child: CommandChild,
    cancelled: Arc<AtomicBool>,
}

// In cancel_download:
fn cancel_download(id: &str, active: &Arc<Mutex<HashMap<String, DownloadHandle>>>) {
    if let Ok(mut map) = active.lock() {
        if let Some(handle) = map.remove(id) {
            handle.cancelled.store(true, Ordering::SeqCst);
            let _ = handle.child.kill();
        }
    }
}

// In process_download's Terminated handler:
// Before setting status, check if cancellation was requested:
if handle.cancelled.load(Ordering::SeqCst) {
    // Don't overwrite Cancelled with Failed
    return;
}
```

- [ ] **Verify** cancelling a download doesn't result in "Failed" status flickering after "Cancelled"

### Task 9J: Pause/resume rewrite (#8.2, #8.3)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`
- Modify: Frontend to disable pause during "Converting"

**Note:** This requires a prototype/spike on real YouTube URLs to confirm `--continue` behavior is acceptable before implementing.

- [ ] **Disable pause button during "Converting" status (frontend)**

```typescript
// In DownloadProgress.tsx or wherever the pause button lives:
const isConverting = downloadStatus === "Converting";
<button disabled={isConverting} onClick={handlePause}>
  {isConverting ? "Converting..." : "Pause"}
</button>
```

- [ ] **Implement kill + --continue resume (Rust)**

```rust
fn pause_internal(id: &str, active: &Arc<Mutex<HashMap<String, DownloadHandle>>>) {
    if let Ok(mut map) = active.lock() {
        if let Some(handle) = map.remove(id) {
            // Don't set cancelled flag — just kill the process
            let _ = handle.child.kill();
            // The item status is set to Paused
        }
    }
}

fn resume_internal(id: &str, request: &DownloadRequest, app: &tauri::AppHandle,
    active: &Arc<Mutex<HashMap<String, DownloadHandle>>>,
    queue: &Arc<Mutex<DownloadQueue>>) -> Result<(), AppError> {

    // Don't create a new queue entry — reuse the existing one
    // Spawn yt-dlp with --continue pointing at partial file
    let output_template = format!("{}/{}", request.output_dir, "%(title)s.%(ext)s");
    let mut cmd = Command::new("yt-dlp");
    cmd.args(&["--continue", "-o", &output_template, &request.url]);
    // ...same process_download flow but without --embed-thumbnail etc.

    // Reuse the same item id in the active map
    let child = cmd.spawn()?;
    active.lock().unwrap().insert(id.to_string(), DownloadHandle {
        child,
        cancelled: Arc::new(AtomicBool::new(false)),
    });

    Ok(())
}
```

- [ ] **Proto/spike**: Test `--continue` with 3-4 real YouTube URLs. If YouTube returns 416 Range Not Satisfiable or re-downloads from scratch, document as known limitation.
- [ ] **Verify** pause+resume doesn't create duplicate queue entries

### Task 9K: Unbounded process spawn with semaphore (#4.7)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`
- Modify: `src-tauri/src/lib.rs` — initialize semaphore

- [ ] **Add tokio::sync::Semaphore**

```rust
// In lib.rs or a shared module:
use std::sync::Arc;
use tokio::sync::Semaphore;

pub struct AppState {
    pub download_semaphore: Arc<Semaphore>,
}

// In setup:
let max_concurrent = settings.concurrency_limit.unwrap_or(3) as usize;
tauri::Builder::default()
    .manage(AppState {
        download_semaphore: Arc::new(Semaphore::new(max_concurrent)),
    })
```

**Note on runtime resizing:** The semaphore's permit count isn't trivially resizable. If the user changes `max_concurrent_downloads` in settings while downloads are active, new downloads use the new cap only after the app is restarted. For this implementation, the setting takes effect on next app launch. A future improvement could use `add_permits`/a wrapper to support live resizing.

- [ ] **Acquire permit before spawning each download**

```rust
async fn enqueue_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: DownloadRequest,
) -> Result<String, AppError> {
    let permit = state.download_semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| AppError::StorageError("Semaphore closed".into()))?;

    tokio::spawn(async move {
        let _permit = permit; // Held for the duration of the download
        process_download(&app, id, request, ...).await;
    });
}
```

- [ ] **Verify** 50 enqueue calls result in at most 3 simultaneous yt-dlp processes

### Task 9L: Atomic queue write (#7.1)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Write to temp file, then rename atomically**

```rust
fn save_queue(path: &Path, queue: &Mutex<DownloadQueue>) {
    let json = serde_json::to_string_pretty(&*queue.lock().unwrap()).unwrap();
    let tmp_path = path.with_extension("json.tmp");
    match std::fs::write(&tmp_path, &json) {
        Ok(_) => {
            if let Err(e) = std::fs::rename(&tmp_path, path) {
                log::error!("Failed to rename queue file atomically: {}", e);
            }
        }
        Err(e) => {
            log::error!("Failed to write queue temp file: {}", e);
        }
    }
}

// On load, prefer .json over .tmp:
fn load_saved_queue(path: &Path) -> Vec<DownloadItem> {
    if path.exists() {
        // Read from canonical path
    } else if path.with_extension("json.tmp").exists() {
        log::warn!("queue.json.tmp found — recovering from temp file");
        // Recover from .tmp and rename
    }
}
```

- [ ] **Verify** a crash mid-write leaves either the old intact queue or the new file, never a truncated file

### Task 9M: Mutex poison recovery (#7.2)

**Files:**
- Modify: `src-tauri/src/queue/mod.rs`

- [ ] **Replace .lock().unwrap() with into_inner() recovery**

```rust
fn lock_queue(q: &Mutex<DownloadQueue>) -> MutexGuard<DownloadQueue> {
    match q.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::warn!("Queue mutex poisoned, recovering inner data");
            // The data behind a poisoned mutex is almost always structurally intact.
            // into_inner() returns the live in-memory struct directly.
            poisoned.into_inner()
        }
    }
}
```

- [ ] **Verify** a panicked thread doesn't take down the app AND doesn't silently wipe the queue

### Task 9N: Silent async panic handling (#7.3)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Wrap spawned future in catch_unwind**

```rust
use std::panic::AssertUnwindSafe;

tokio::spawn(async move {
    let result = std::panic::AssertUnwindSafe(process_download(
        app.clone(), id.clone(), request.clone(), queue.clone(), active.clone(),
    )).catch_unwind().await;

    match result {
        Ok(Ok(_)) => {} // Normal completion
        Ok(Err(e)) => {
            log::error!("Download {} failed: {:?}", id, e);
            // Error already handled by process_download
        }
        Err(panic_payload) => {
            log::error!("Download {} panicked: {:?}", id, panic_payload);
            // Emit Failed event so frontend isn't stuck
            if let Ok(mut q) = queue.lock() {
                if let Some(item) = q.items.iter_mut().find(|i| i.id == id) {
                    item.status = "Failed".to_string();
                    item.error = Some("Internal error".to_string());
                }
            }
            save_queue(queue_path);
            let _ = app.emit("download-item-update", serde_json::json!({
                "id": id, "status": "Failed", "error": "Internal error"
            }));
        }
    }
});
```

- [ ] **Verify** a panic in the download task marks the item as Failed and notifies the frontend

### Task 9O: Orphaned subprocess guard (#9.5)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Create ProcessGuard with Drop impl**

```rust
struct ProcessGuard {
    id: String,
    child: Option<CommandChild>,
    active: Arc<Mutex<HashMap<String, CommandChild>>>,
}

impl Drop for ProcessGuard {
    fn drop(&mut self) {
        if let Some(child) = self.child.take() {
            let _ = child.kill();
        }
        if let Ok(mut map) = self.active.lock() {
            map.remove(&self.id);
        }
    }
}

// Usage in process_download:
let guard = ProcessGuard {
    id: id.clone(),
    child: Some(child),
    active: active.clone(),
};
// ...pass guard to everything, on drop it cleans up...
```

- [ ] **Verify** if a task is cancelled or panics, the yt-dlp child process is killed

### Task 9P: Output directory creation (#4.2)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

- [ ] **Create directory if missing, check accessibility**

```rust
let output_dir = Path::new(&request.output_dir);

// Create directory and parents if missing
if !output_dir.exists() {
    std::fs::create_dir_all(output_dir)
        .map_err(|e| AppError::StorageError(format!("Failed to create output dir: {}", e)))?;
}

// Verify write accessibility
let test_file = output_dir.join(".ytmate_write_test");
match std::fs::write(&test_file, b"") {
    Ok(_) => { let _ = std::fs::remove_file(&test_file); }
    Err(e) => {
        return Err(AppError::StorageError(format!(
            "Output directory is not writable: {}", e
        )));
    }
}
```

- [ ] **Verify** downloading to a non-existent directory auto-creates it. Downloading to a read-only directory shows a clear error.

### Task 9Q: +bestaudio fallback per entry (#4.4, #5.4)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Add bridge function: format_id → quality tier**

```rust
// Rust side — build tier string from format_id:
fn quality_tier_from_format_id(format_id: &str, formats: &[FormatInfo]) -> String {
    // Find the selected format's height
    let height = formats.iter()
        .find(|f| f.format_id == format_id)
        .and_then(|f| f.height);
    match height {
        Some(h) if h > 0 => format!("bestvideo[height<={}]+bestaudio/best", h),
        _ => "best".to_string(), // Fallback if height unknown
    }
}
```

- [ ] **Use tier per playlist entry**

```typescript
// In download-execution-store.ts, playlist download loop:
for (const idx of selectedIndices) {
    const entry = entries[idx];
    // Resolve tier from the user's selected format_id
    const tier = qualityTierFromFormatId(selectedQuality, formats);
    const formatArg = tier;  // yt-dlp format string

    const request = {
        url: entry.url,
        format_id: formatArg,  // Tier for playlist, format_id for single
        // ...other fields...
    };
    const result = await dataService.enqueueDownload(request);
}
```

- [ ] **Verify** playlist entries with different available formats each get the best matching format within the user's chosen tier

### Task 9R: Sidecar missing error (#9.3)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`
- Modify: `src-tauri/src/error.rs`

- [ ] **Return structured SidecarNotFound error**

```rust
// In process_download, when sidecar resolution fails:
let sidecar = app.shell().sidecar("yt-dlp")
    .map_err(|e| AppError::SidecarNotFound(e.to_string()))?;
```

- [ ] **Frontend shows repair action**

```typescript
// In DownloadPage.tsx or error handler:
if (error.includes("Sidecar not found") || error.includes("yt-dlp")) {
  return (
    <div className="error-card">
      <p>yt-dlp binary not found</p>
      <button onClick={() => dataService.updateYtdlp()}>
        Download yt-dlp
      </button>
    </div>
  );
}
```

- [ ] **Verify** if yt-dlp is deleted, the UI shows a "Download yt-dlp" button

### Task 9S: Deferred promise timeout (#5.2)

**Files:**
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Reduce timeout and add heartbeat**

```typescript
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const STALL_TIMEOUT = 60 * 1000; // 60 seconds without progress

// In the playlist download loop for each item:
const deferred = new Deferred<void>();
let lastProgressTime = Date.now();
let lastProgressValue = 0;

const unsub = await listen<DownloadItem>('download-item-update', (e) => {
  if (e.payload.id === item.id) {
    if (e.payload.progress > lastProgressValue) {
      lastProgressTime = Date.now();
      lastProgressValue = e.payload.progress;
    }
    if (['completed', 'failed', 'cancelled'].includes(e.payload.status)) {
      deferred.resolve();
    }
  }
});

// Race against timeout + stall detection
const result = await Promise.race([
  deferred.promise,
  new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error('Download timed out')), DOWNLOAD_TIMEOUT)
  ),
  (async () => {
    while (true) {
      await new Promise(r => setTimeout(r, STALL_TIMEOUT));
      if (Date.now() - lastProgressTime >= STALL_TIMEOUT && lastProgressValue > 0) {
        throw new Error('Download stalled');
      }
    }
  })(),
]);
```

- [ ] **Verify** a download that stalls without events gets marked as Failed within 5 minutes

### Task 9T: Race between deferred resolve and queue poll (#5.3)

**Files:**
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Use event payload directly instead of re-fetching queue**

```typescript
// Instead of:
// const qItems = await dataService.getQueue();
// const finalItem = qItems.find(i => i.id === item.id);

// Use the payload from the event:
let finalItem: DownloadItem | null = null;
const unsub = await listen<DownloadItem>('download-item-update', (e) => {
  if (e.payload.id === item.id) {
    finalItem = e.payload; // Capture final state from event
    if (['completed', 'failed', 'cancelled'].includes(e.payload.status)) {
      deferred.resolve();
    }
  }
});

await deferred.promise;
// Use finalItem directly — no race with getQueue()
```

- [ ] **Verify** the final item lookup doesn't miss items that were removed between events

### Task 9U: Concurrency applies globally (#5.6)

Already covered by Task 9K — the semaphore in AppState applies globally to all downloads.

### Task 9V: Phase transition guard (#5.7)

**Files:**
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Add debounce before transitioning to completed**

```typescript
// After Promise.all(workers):
await new Promise(resolve => setTimeout(resolve, 500)); // 500ms debounce
set({
  isDownloading: false,
  // phase transition is handled by the calling code
});
```

- [ ] **Verify** the phase doesn't transition to "completed" while the last item's progress event is still in flight

### Task 9W: Analysis cache capacity (#2.7)

**Files:**
- Modify: `src/shared/lib/analysis-cache.ts`

- [ ] **Add max cache size with LRU eviction**

```typescript
const MAX_CACHE_SIZE = 50;

const cache = new Map<string, { result: AnalyzeResponse; timestamp: number }>();
const TTL = 10 * 60 * 1000; // 10 minutes

export function setCachedAnalysis(url: string, result: AnalyzeResponse) {
  // Evict oldest if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, { result, timestamp: Date.now() });
}
```

- [ ] **Verify** analyzing 60 unique URLs evicts the oldest 10 from cache

### Task 9X: CSP non-null (#12.4)

Already covered by Task 4.17 (move to Phase 4).

### Task 9Y: Failed(String) serialization (#4.8)

**Files:**
- Modify: `src-tauri/src/models/mod.rs`
- Modify: `src/stores/download-execution-store.ts`

- [ ] **Switch to flat status model**

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub title: String,
    pub status: String,  // "Completed", "Failed", "Cancelled", etc.
    pub error: Option<String>,  // populated only when status == "Failed"
    pub progress: f64,
    pub speed: String,
    pub eta: String,
    pub output_path: String,
    pub filename: String,
    // ...other fields...
}
```

- [ ] **Update frontend to read flat fields**

```typescript
// Before:
const statusText = typeof item.status === 'string' ? item.status : Object.keys(item.status)[0];
// After:
const statusText = item.status;
const errorMessage = item.error;
```

- [ ] **Verify** frontend parses status without custom key extraction logic

---

## Verification

- [ ] `cargo check` passes with no warnings
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npx vite build` produces a successful build
- [ ] Critical path: paste URL → analyze → configure → download → verify file on disk
- [ ] Playlist path: paste playlist → select items → download batch → all items complete
- [ ] Cancellation: cancel mid-download → item shows Cancelled, not Failed
- [ ] Premiere mode with non-MP4 encoding produces correct output
- [ ] Filenames with `..`, null bytes, Unicode are sanitized safely
- [ ] URL validation rejects `file://` and `javascript:` URIs
- [ ] Progress appears in both `.` and `,` decimal locales
- [ ] Queue file never left truncated after crash
- [ ] Settings with `filename_pattern` survive restart
