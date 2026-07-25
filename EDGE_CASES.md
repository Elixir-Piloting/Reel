# Edge-Case & Failure-Point Audit: Reel (ytmate)

> **Scope**: Every code path from URL paste → analysis → options → download → post-processing → persistence.
> **Method**: Simulated each flow against the actual code. Entries cite specific files and line numbers.
> **No fixes are proposed** — this is a triage reference.

---

## 1. URL Input & Validation

### 1.1 No URL validation before passing to yt-dlp
**File**: `src/features/url-input/UrlInput.tsx:40-56`, `src-tauri/src/commands/analyze.rs:169`
**Issue**: Any string — empty, whitespace, garbage, local file paths, `javascript:` URIs, shell metacharacters — is handed directly to yt-dlp's sidecar. yt-dlp will try to interpret it, potentially making network requests to unexpected targets or returning opaque error messages.
**Severity**: Medium

### 1.2 Paste-triggered analysis races itself
**File**: `src/features/url-input/UrlInput.tsx:50-56`
**Issue**: `handleInputPaste` calls `e.preventDefault()` then `setTimeout(() => analyzeUrl(pasted.trim()), 0)`. Meanwhile the React state `url` is already set synchronously. If two pastes happen in quick succession, `analyzeUrl`'s generation counter (`analyzeGen`, line 31 of analysis-store.ts) will suppress the first, but the URL state may have already flipped to the second URL with stale analysis data appearing briefly.
**Severity**: Low

### 1.3 URL history dedup by URL only
**File**: `src/features/url-input/useUrlHistory.ts:19-26`
**Issue**: History deduplication (`filter(e => e.url !== url)`) uses only URL equality. If the same video is pasted with different tracking parameters (`?si=...`, `&feature=shared`), it creates duplicate entries.
**Severity**: Low

### 1.4 sessionStorage persistence — lost on app restart
**File**: Multiple stores (analysis-store.ts:156, download-execution-store.ts:277, options-store.ts:55, playlist-store.ts:74)
**Issue**: All zustand stores use `sessionStorage` via `createJSONStorage(() => sessionStorage)`. In a Tauri WebView, sessionStorage is cleared when the application process ends. This means all analysis results, options, playlist state, and download execution state are lost on every app restart. Only queue.json on the Rust side survives.
**Severity**: Medium (data loss on restart for in-progress state)

---

## 2. Video Analysis (yt-dlp metadata call)

### 2.1 Unicode / non-UTF-8 metadata silently corrupted
**File**: `src-tauri/src/commands/analyze.rs:188`
**Issue**: `String::from_utf8_lossy(&output.stdout)` replaces invalid UTF-8 byte sequences with U+FFFD (replacement character). Video titles, channel names, or descriptions containing invalid UTF-8 (rare but possible) are silently corrupted. yt-dlp's JSON is guaranteed UTF-8, but a network glitch could produce truncated bytes.
**Severity**: Medium

### 2.2 Missing JSON fields produce silent defaults
**File**: `src-tauri/src/commands/analyze.rs:43-51`
**Issue**: Every field access uses `unwrap_or("Unknown")` or `unwrap_or(0.0)`. If yt-dlp's JSON shape changes between versions, or for unusual video types (premieres, upcoming streams, members-only), missing fields produce garbage silently: `title="Unknown"`, `duration=0.0`, `channel="Unknown"`. The user gets an "analyzed successfully" toast with no useful info.
**Severity**: Medium

### 2.3 Single-entry playlist treated as single video
**File**: `src-tauri/src/commands/analyze.rs:193-194`
**Issue**: `json["entries"].as_array()` and `entries.len() > 1` determines playlist vs. single. A playlist with exactly 1 entry is treated as a regular video — the `entries` key exists, but `.len() > 1` is false. Formats are parsed from the top-level JSON, which won't contain individual entry formats because of `--flat-playlist`.
**Severity**: High (playlist with 1 entry shows wrong data/no formats)

### 2.4 `extract_thumbnail` constructs URLs without validation
**File**: `src-tauri/src/commands/analyze.rs:126-136`
**Issue**: If `thumbnail` and `id` fields are missing, the function falls back to manually extracting a video ID from the URL using string search for `v=`. This produces `https://i.ytimg.com/vi/{arbitrary_string}/mqdefault.jpg` — no validation that the extracted substring is actually a valid video ID. Broken images displayed in the UI.
**Severity**: Low (cosmetic)

### 2.5 Filesize may be absent for DASH/video-only formats
**File**: `src-tauri/src/commands/analyze.rs:111`
**Issue**: `fmt["filesize"].as_u64().or_else(|| fmt["filesize_approx"].as_u64())` — both fields may be `null` for streaming formats. The frontend displays `filesize ? (X.XMB) : ''`. Filesize shown as empty or "NaN" is possible.
**Severity**: Low

### 2.6 Resolution parsing from format_note is fragile
**File**: `src-tauri/src/commands/analyze.rs:85-88`
**Issue**: `.or_else(|| fmt["format_note"].as_str())` chains resolution to `format_note`, which can be strings like "144p", "720p60", "medium", "hd720". These flow into `buildQualityOptions` on the frontend, which tries `parseInt(resolution.replace(/(\d+).*/, '$1'))`. Unexpected strings produce NaN height and fall to "audio" key.
**Severity**: Low

### 2.7 Analysis cache never invalidated
**File**: `src/shared/lib/analysis-cache.ts:8-9`
**Issue**: Cache has a 10-minute TTL based on access time, but no capacity limit. For power users analyzing many videos, the in-memory `Map<string, CacheEntry>` grows unbounded. No eviction strategy beyond TTL expiry.
**Severity**: Low

### 2.8 Empty playlist entries silently succeed
**File**: `src-tauri/src/commands/analyze.rs:192-195`
**Issue**: If `entries` is `Some([])` (empty array), `is_playlist` = false. The code treats it as a single video with no formats, producing an `AnalyzeResponse` with `video_meta`, `formats: Some([])`, and no error. The user sees "analysis complete" with no usable data.
**Severity**: Medium

---

## 3. Format / Quality Options

### 3.1 Quality selection stored by label, not format_id
**File**: `src/stores/analysis-store.ts:144-146`, `src/stores/options-store.ts:10`
**Issue**: `selectedQuality` is set to `arr[0].label` (e.g., "Best" or "1080p (25.3MB)"), then looked up by label in `buildQualityOptions`. If formats change between analyses (e.g., different codec options for different videos), a stale label from a previous analysis may match nothing, silently defaulting.
**Severity**: Medium

### 3.2 `buildQualityOptions` deduplicates by height only
**File**: `src/stores/analysis-store.ts:130-139`
**Issue**: The dedup key is `h > 0 ? \`${h}p\` : 'audio'`. If two formats share the same height but differ in codec, FPS, or bitrate, only the first is shown. The user may never see 60fps options if a 30fps format appears first. The `show_all_formats` setting exists in AppSettings but is never read here.
**Severity**: Medium

### 3.3 Encoding key mismatch between frontend and backend
**File**: `src/shared/lib/encoding-config.ts:18-28` vs `src-tauri/src/commands/download.rs:119-127`
**Issue**: Frontend encoding keys are `"mp4_h264"`, `"mp4_h265"`, etc. The backend only matches `"mkv"`, `"webm"`, `"m4a"`, `"opus"`, `"flac"`, `"wav"` explicitly and falls to `"mp4"` for anything else. So `"mp4_h264"` and `"mp4_h265"` both produce `"mp4"` — the distinction is lost. The user selecting "MP4 (H.265/HEVC)" actually downloads the same as "MP4 (H.264)".
**Severity**: High (feature doesn't work as labeled)

### 3.4 Range slider endTime initialized from stale metadata
**File**: `src/features/download-options/RangeSelector.tsx:17-24`
**Issue**: `prevMax` ref tracks the previous duration. If the user switches videos (new analysis), `endTime` clamps to the new duration, but `startTime` may remain non-zero from the previous video, creating an unintentional trim range.
**Severity**: Low

### 3.5 `timeToSeconds` produces NaN on malformed input
**File**: `src/lib/utils.ts:26-31`
**Issue**: `parts.map(Number)` on non-numeric input like `"abc"` produces `[NaN]`. `NaN * 3600 + ...` stays NaN. This NaN propagates into the options store as `startTime`/`endTime`.
**Severity**: Low (user-facing input, easily corrected)

---

## 4. Single-Video Download Path

### 4.1 `--no-playlist` blocks genuine playlist URLs in single-video mode
**File**: `src-tauri/src/commands/download.rs:265`
**Issue**: Hardcoded `--no-playlist` is always passed. If the user pastes a channel URL or playlist URL and the analysis correctly classifies it as a playlist, this isn't an issue. But if a single-video URL is analyzed and the user then modifies it in the input... the flag is correct behavior.
**Severity**: None (by design)

### 4.2 No output-directory existence check
**File**: `src-tauri/src/commands/download.rs:294-296`
**Issue**: The disk-space check is a no-op (`if let Ok(_meta) = std::fs::metadata(&output_dir) { }`). It verifies the directory exists but does nothing with that information. If the directory doesn't exist (removed USB drive, unmounted network share), yt-dlp will fail with an error message that may be opaque.
**Severity**: Medium

### 4.3 `sanitize_filename` allows path traversal and control characters
**File**: `src-tauri/src/commands/download.rs:80-83`
**Issue**: Only `\ / : * ? " < > |` are replaced. The following bypasses are possible:
- Null bytes (`\0`) — may truncate the filename in some C/C++ layers
- Control characters (0x00-0x1F) — can confuse terminals and file systems
- `..` is not stripped — if the filename itself is `..`, the output path becomes `output_dir/../malicious.exe`
- Characters above U+007F (Unicode confusables) — no normalization
The frontend `DestinationSelector.tsx:21` also applies its own `replace(/[\\/:*?"<>|]/g, "_")` but the Rust backend is the source of truth.
**Severity**: High (potential path traversal / file overwrite)

### 4.4 `+bestaudio` fallback format may fail on some sites
**File**: `src-tauri/src/commands/download.rs:222`
**Issue**: When `!has_audio`, the format spec is `format_id + "+bestaudio"`. For non-YouTube sites or unusual video formats (e.g., a video-only format_id like `"247"` which is already a DASH stream), yt-dlp may fail to merge or find a compatible audio stream.
**Severity**: Medium

### 4.5 Retry loop runs immediately with no backoff
**File**: `src-tauri/src/commands/download.rs:210-544`
**Issue**: The `'retry: loop` retries immediately on failure (no delay). If the failure is transient (network hiccup, rate limiting), retrying instantly is unlikely to succeed and may worsen rate limiting.
**Severity**: Medium

### 4.6 Second retry disables thumbnail embedding unconditionally
**File**: `src-tauri/src/commands/download.rs:215`
**Issue**: `let embed_thumbnail = attempt == 1;` — thumbnail embedding is disabled on the retry. If the failure was unrelated to thumbnail embedding, the retry succeeds but without thumbnails. The user gets a different-quality output with no indication.
**Severity**: Low

### 4.7 Concurrent process spawns are unbounded
**File**: `src-tauri/src/commands/download.rs:172-174`
**Issue**: Each `enqueue_download` call spawns a `tauri::async_runtime::spawn` task that immediately calls `process_download`. There is no semaphore, worker pool, or throttling. If 50 enqueue calls happen, 50 yt-dlp processes are spawned simultaneously, competing for I/O and network bandwidth.
**Severity**: High (resource exhaustion, system slowdown)

### 4.8 `DownloadStatus::Failed` serialization forces complex frontend parsing
**File**: `src-tauri/src/models/mod.rs:91`, `src/stores/download-execution-store.ts:242`
**Issue**: `Failed(String)` serializes via serde as `{"Failed": "error message"}` — a JSON object with one key. The frontend must check `typeof status === 'string'` vs. `object` and extract the key. This is handled in the code but fragile: if serde representation changes (e.g., `#[serde(untagged)]`), all status string parsing breaks silently.
**Severity**: Medium (maintenance hazard)

---

## 5. Playlist Download Path

### 5.1 Individual item cancellation uses wrong ID → no-op
**File**: `src/features/playlist/PlaylistSelector.tsx:152`, `src/stores/playlist-store.ts:10`
**Issue**: The cancel button passes `entry.id` (which is the video URL, set at analysis-store.ts:80). But `cancel_download` on the Rust side expects the UUID generated in `enqueue_download`. `entry.url` will never match any active process ID. The user clicks cancel, gets a false success, but the download continues.
**Severity**: Critical (playlist cancel button does nothing)

### 5.2 Deferred promise may stall forever
**File**: `src/stores/download-execution-store.ts:134-139`
**Issue**: `downloadOne` creates a `Deferred<void>` resolved by a `download-item-update` event listener. If the event is never emitted (e.g., the process crashes before emitting any event, or the download-item-update event is filtered out by `e.payload.id === item.id` check), the deferred never resolves. The 30-minute timeout catches this (line 148), but that ties up a playlist worker slot for 30 minutes.
**Severity**: High

### 5.3 Race condition between deferred resolve and queue poll
**File**: `src/stores/download-execution-store.ts:155-158`
**Issue**: After `deferred.promise` resolves, `dataService.getQueue()` fetches the full queue. Between the deferred resolving (in the event listener) and the `getQueue()` call, the queue state could have already changed (e.g., another download completed/failed). The `finalItem` lookup `qItems.find(i => i.id === item.id)` might return stale data, or miss the item entirely if it was removed.
**Severity**: Medium

### 5.4 Same format_id applied to all playlist entries
**File**: `src/stores/download-execution-store.ts:104-105`
**Issue**: A single `format_id` (from `qualityOptions`) is used for every playlist entry. Videos in a playlist may have different available formats — e.g., some are 4K, some only 1080p. yt-dlp will error on entries where the specified format_id doesn't exist. The error appears per-entry as "failed" with no fallback.
**Severity**: Medium

### 5.5 Empty channel/duration/thumbnail for playlist entries
**File**: `src/stores/download-execution-store.ts:127-129`
**Issue**: `channel: ''` and `duration: entry.duration || 0` are passed for playlist entries. The `thumbnail_url` uses `entry.thumbnail` from `extract_thumbnail`, which may produce an empty string. These missing fields won't crash anything but produce incomplete records.
**Severity**: Low

### 5.6 Concurrency limit from settings applies only to playlists
**File**: `src/stores/download-execution-store.ts:106`
**Issue**: `max_concurrent_downloads` limits playlist workers but has no effect on individual downloads (each enqueue spawns its own task immediately). Users who set a low concurrency expecting system-wide throttling will be surprised.
**Severity**: Medium

### 5.7 Playlist download phase transitions before all workers finish
**File**: `src/stores/download-execution-store.ts:177-178`
**Issue**: After `await Promise.all(workers)`, `isDownloading` is set to `false` and phase to `'completed'`. But workers chain via `.finally(next)`, meaning even if some `downloadOne` calls reject, the chain continues. However, the `!isDownloading` gate at line 238 may cause issues if the user immediately navigates away.
**Severity**: Medium

### 5.8 No deduplication check for playlist downloads
**File**: `src/stores/download-execution-store.ts:108-175`
**Issue**: The same playlist can be downloaded multiple times. There's no check against `resolve_filename_conflict` per-entry (that happens on the Rust side), but no UI indication of potential duplicates.
**Severity**: Low

---

## 6. FFmpeg Post-Processing (Premiere Mode)

### 6.1 Input path hardcoded to `.mp4`
**File**: `src-tauri/src/commands/download.rs:423`
**Issue**: `let input_path = format!("{}/{}.mp4", output_dir, safe_filename)` assumes the downloaded file is `.mp4`. If the user selected MKV or WebM encoding, the file won't exist at this path. The ffmpeg spawn will fail, and the code drops into the `Err(_)` branch which breaks the retry loop silently.
**Severity**: Critical (premiere mode + non-mp4 encoding fails silently)

### 6.2 File deleted before rename
**File**: `src-tauri/src/commands/download.rs:451-452`
**Issue**: `std::fs::remove_file(&input_path)` runs before `std::fs::rename(&temp_path, &input_path)`. If the rename fails (e.g., disk full, permission denied, AV scanning), the original file is gone and the converted file was never moved to the right place. The user sees a "Completed" status with no file on disk.
**Severity**: Critical (data loss)

### 6.3 Temp file cleanup leak on failure
**File**: `src-tauri/src/commands/download.rs:437-438`
**Issue**: If ffmpeg spawn fails (`Err(_)`), the code does `break 'retry` without cleaning up the output from yt-dlp. The partial `.mp4` file from yt-dlp remains on disk even though the item is not marked Completed.
**Severity**: Medium (orphaned files)

### 6.4 ffmpeg progress parsed but discarded
**File**: `src-tauri/src/commands/download.rs:447`
**Issue**: `parse_ffmpeg_progress(&text)` is called but its return value (the time in seconds) is discarded. The UI shows "Converting" status with no progress indicator during conversion.
**Severity**: Low (cosmetic)

### 6.5 Premiere mode for audio downloads is silently ignored
**File**: `src-tauri/src/commands/download.rs:414`
**Issue**: `if premiere_mode && download_type == DownloadType::Video` — if premiere mode is enabled for audio downloads, the conversion block is skipped entirely with no indication to the user.
**Severity**: Low

---

## 7. Persistence / State

### 7.1 queue.json written without atomicity (corruption risk)
**File**: `src-tauri/src/commands/download.rs:37-39`
**Issue**: `std::fs::write(&path, json)` directly overwrites the file. If the app crashes mid-write, the file is left with a partial JSON blob that can't be parsed. On next startup, `load_saved_queue` silently discards the entire queue (all items lost).
**Severity**: High (queue data loss on crash)

### 7.2 Mutex poison on queue lock
**File**: `src-tauri/src/queue/mod.rs:24-27`
**Issue**: `.lock().unwrap()` is used throughout. If a thread panics while holding the lock, the mutex becomes poisoned. All subsequent `.lock().unwrap()` calls will panic, crashing the app entirely.
**Severity**: Medium

### 7.3 Thread panic in spawned async task is silent
**File**: `src-tauri/src/commands/download.rs:172-174`
**Issue**: `tauri::async_runtime::spawn` wraps the future. If `process_download` panics (e.g., from a poisoned mutex), the panic is caught by the tokio runtime and logged, but the queue item stays in "Downloading" status permanently. No event is emitted to the frontend.
**Severity**: High (item stuck in limbo)

### 7.4 `load_saved_queue` silently accepts mismatched schema
**File**: `src-tauri/src/commands/download.rs:48-52`
**Issue**: If `data.version != QUEUE_SCHEMA_VERSION`, the new-format parse is skipped. If the legacy fallback also fails, the queue is silently left empty. No migration path exists for future schema changes.
**Severity**: Medium

### 7.5 `filenamePattern` setting silently dropped
**File**: `src/features/settings/SettingsPage.tsx:94`, `src-tauri/src/models/mod.rs:105-112`
**Issue**: The frontend accesses `(settings as any).filenamePattern` and saves it via `updateSettings`. But `AppSettings` struct does not include `filename_pattern`. When `save_settings` serializes `AppSettings`, serde drops unknown fields by default. The user's filename pattern is silently discarded.
**Severity**: High (setting does nothing)

### 7.6 Settings file silently returns defaults on any error
**File**: `src-tauri/src/commands/settings.rs:13`
**Issue**: `serde_json::from_str(&data).unwrap_or_default()` — if the settings file contains any invalid JSON (corrupted, manually edited, from a future version), all settings silently reset to defaults. No log message, no error in UI.
**Severity**: Medium

### 7.7 `queue.json` grows unbounded
**File**: `src-tauri/src/queue/mod.rs:42-44`
**Issue**: `prune_older_than` is a no-op (logs only, no timestamps on items). Completed/failed/cancelled items accumulate in queue.json forever. No capacity limit, no automatic pruning.
**Severity**: Low (over long usage)

---

## 8. Cancellation & Pause/Resume

### 8.1 Cancel race: process_download may overwrite status
**File**: `src-tauri/src/commands/download.rs:513-514` vs `src-tauri/src/commands/download.rs:563-565`
**Issue**: `cancel_download` sets status to `Cancelled`. But `process_download`'s streaming loop may still be running and processing the `Terminated` event (from the process being killed). The Terminated handler (line 496-536) may set status to `Failed` or retry, overwriting `Cancelled`. The final state depends on a race condition.
**Severity**: High (status flickers between Cancelled and Failed)

### 8.2 Pause loses progress
**File**: `src-tauri/src/commands/download.rs:654-671`
**Issue**: `pause_internal` kills the child process (same as cancel). Progress from the yt-dlp output is lost. On resume, `process_download` starts a brand new download with no partial file — yt-dlp will re-download from the beginning. The UI shows "Paused" then resumes at 0%.
**Severity**: Medium (progress reset, not data loss)

### 8.3 Resume creates duplicate download entries
**File**: `src-tauri/src/commands/download.rs:673-703`
**Issue**: `resume_internal` calls `process_download` which creates a new yt-dlp process and downloads from scratch. The original item remains in the queue; its status is already `Paused`. The new download runs parallel to the paused (now dead) item, and the original Paused item remains in the queue until manually removed.
**Severity**: High (duplicate items)

### 8.4 Cancel from DownloadsPage may miss newly spawned processes
**File**: `src/features/download-history/DownloadList.tsx:101-106`
**Issue**: Clicking cancel calls `dataService.cancelDownload(item.id)` then `onRefresh` (re-fetches queue). If the process hasn't been registered in `active` yet (race between `enqueue_download` spawning the task and the process starting), `cancel_download` won't find a child to kill, but will set the queue status to Cancelled.
**Severity**: Medium

### 8.5 `cancel_all_downloads` counts queued items but doesn't kill processes for them
**File**: `src-tauri/src/commands/download.rs:599-619`
**Issue**: The function iterates `active` processes and kills them, then marks `Queued`/`Downloading` items as `Cancelled`. But the active HashMap only contains items currently being downloaded. Items that are queued (waiting) have no process to kill, which is correct — they simply haven't started yet. But a queued item whose status is overwritten to Cancelled may have already been picked up by the async runtime. If the spawned task for a queued item hasn't yet called `process_download` (i.e., it's waiting on the executor), it will proceed to download despite being marked Cancelled.
**Severity**: Medium

---

## 9. Subprocess Management (yt-dlp / ffmpeg)

### 9.1 Hardcoded Windows binary paths
**File**: `src-tauri/src/commands/update.rs:18`, `src-tauri/binaries/`
**Issue**: Binary is named `yt-dlp-x86_64-pc-windows-msvc.exe` and paths are Windows-specific. The Tauri sidecar mechanism handles platform suffix resolution, but the `browse.rs` `open_in_explorer` command hardcodes `explorer`. Cross-platform support would require changes throughout.
**Severity**: Low (Windows-only app by design)

### 9.2 Update downloads without integrity check
**File**: `src-tauri/src/commands/update.rs:5-23`
**Issue**: `update_ytdlp` downloads the EXE from a hardcoded URL with no checksum verification, no TLS pinning, and no progress reporting. If the download is interrupted, a truncated exe is written to disk. No backup of the current binary is kept.
**Severity**: High (bricked yt-dlp after failed update)

### 9.3 yt-dlp sidecar resolution failure is unrecoverable
**File**: `src-tauri/src/commands/download.rs:298-328`
**Issue**: If the sidecar binary is missing (deleted, failed update), `app.shell().sidecar("yt-dlp")` returns an error. This is handled — the item is marked Failed. But the error message "Sidecar not found" is not actionable from the UI. No re-download or repair flow exists.
**Severity**: Medium

### 9.4 ffmpeg errors during conversion are swallowed
**File**: `src-tauri/src/commands/download.rs:436-438`
**Issue**: If ffmpeg spawn fails (`Err(_)` in either the sidecar or spawn call), the code does `break 'retry` — breaking out of the retry loop entirely. The item status remains "Converting" (set on line 417) with no "Failed" update and no progress event. The frontend sees a stuck "Converting" state forever.
**Severity**: Critical (stuck "Converting" state)

### 9.5 No signal handling for orphaned subprocesses
**File**: `src-tauri/src/commands/download.rs:172-544`
**Issue**: Each spawned yt-dlp process is tracked in `active: HashMap<String, CommandChild>`. If the async task is dropped without removing from active (panic, cancellation race), the process continues running but is untracked. No process watchdog exists.
**Severity**: Medium

---

## 10. Progress Reporting

### 10.1 Progress regex fails for locale-specific decimal separator
**File**: `src-tauri/src/models/progress.rs:16-17`
**Issue**: `(\d+\.?\d*)%` requires a dot as decimal separator. If yt-dlp is configured to use locale-specific formatting (comma as decimal, e.g., `1,5%`), the regex doesn't match and progress is never parsed. The download appears stuck at 0% forever.
**Severity**: High (stuck progress on some system locales)

### 10.2 Progress over 100% not clamped
**File**: `src-tauri/src/models/progress.rs:17`
**Issue**: yt-dlp can report progress > 100% during post-processing (e.g., 105% when merging). The raw float is stored and emitted to the frontend. The SVG pie progress clamps via `Math.min(percent, 100)` (DownloadProgress.tsx:9), but the numeric display `toFixed(0)%` could show "105%".
**Severity**: Low (cosmetic)

### 10.3 Throttle batching drops intermediate states
**File**: `src-tauri/src/commands/download.rs:363-368`
**Issue**: Progress events are throttled to at most one per 100ms or per 1% change. The last progress event before completion uses the throttled value, not the final 100%. If the last throttle interval showed 87% and then the download completes, the UI briefly shows 87% before the "Completed" event flips to 100%.
**Severity**: Low

---

## 11. Frontend UI State Issues

### 11.1 `canDownload` gate doesn't verify output directory existence
**File**: `src/pages/DownloadPage.tsx:44`
**Issue**: `const canDownload = phase === "ready" && !!effectiveDir && !!selectedQuality && !isDownloading` — checks that `effectiveDir` is non-empty but doesn't verify the directory actually exists on disk. User can click Download with a directory that was since removed.
**Severity**: Medium

### 11.2 Error display no longer shown after successful analysis
**File**: `src/pages/DownloadPage.tsx:57-86`
**Issue**: The error section only shows when phase === "error" (line 109). If analysis succeeds but produces empty formats (no usable data), phase becomes "ready" but no download button appears (qualityOptions is empty, selectedQuality is empty). The user sees a blank ready state with no error message or guidance.
**Severity**: Medium

### 11.3 History polling never stops
**File**: `src/pages/DownloadsPage.tsx:23-24`, `src/features/download-history/HistoryPanel.tsx:25-26`
**Issue**: Both pages poll `dataService.getQueue()` every 2 seconds, even when the app has no active downloads. This creates perpetual disk I/O on queue.json (the backend reads it via in-memory state, but the serde deserialization occurs every poll). For a long-running session, this is wasteful.
**Severity**: Low

### 11.4 `DownloadProgress` component shows "starting..." indefinitely under some conditions
**File**: `src/features/download-execution/DownloadProgress.tsx:41-48`
**Issue**: If `!downloadItem && isDownloading`, it shows "Starting download...". If `enqueue_download` fails but `isDownloading` is still true (line 88 of download-execution-store sets `isDownloading: false` only in the catch), this state can persist if the failure happens differently.
**Severity**: Low

### 11.5 TitleBar's `isMaximized` can be stale
**File**: `src/components/layout/TitleBar.tsx:11`
**Issue**: `isMaximized()` is called once on mount. If the window state changes via OS shortcuts (Win+Arrow, double-click title bar) before the user clicks the button, the displayed icon may be wrong. The click handler re-checks, but the initial state is stale.
**Severity**: Low

---

## 12. Security / Sandboxing

### 12.1 No URL validation → potential SSRF
**File**: `src-tauri/src/commands/analyze.rs:169-181`
**Issue**: The URL is passed directly to the yt-dlp sidecar without validation. yt-dlp can make arbitrary HTTP requests, access local network resources, read local files (via `file://`), and interact with cloud provider metadata endpoints if running on a cloud VM. A malicious or auto-completed URL could trigger SSRF.
**Severity**: High

### 12.2 Filename sanitization allows path traversal
**File**: `src-tauri/src/commands/download.rs:80-83`
**Issue**: `..` is not filtered. If `request.filename` is set to `../../malicious` by the frontend (or via a video title like `..`), the output path becomes `output_dir/../../malicious.mp4`. This allows writing files outside the intended download directory.
**Severity**: High (file write outside sandbox)

### 12.3 Output directory not validated
**File**: `src-tauri/src/commands/download.rs:260-262`
**Issue**: `output_dir` from the frontend is used directly in the yt-dlp output template. The user can set this to any path via the browse dialog or by manipulating the URL history. No validation restricts output to allowed directories.
**Severity**: Medium

### 12.4 CSP explicitly nulled
**File**: `src-tauri/tauri.conf.json:25`
**Issue**: `"csp": null` disables Content Security Policy entirely. Any script injection (via yt-dlp metadata containing JavaScript, or via malicious thumbnail URLs) would execute unrestricted.
**Severity**: Medium

---

## 13. Race Conditions & Concurrency

### 13.1 `analyzeGen` generation counter not reset on error
**File**: `src/stores/analysis-store.ts:110-113`
**Issue**: If `dataService.analyzeVideo(url)` throws, `gen !== analyzeGen` is checked. If no concurrent analysis happened, the catch block executes. But the abort check on line 111 uses the same `analyzeGen` comparison, which is correct. However, if the error is caught and the user immediately pastes a new URL, the stale error remains visible for one render cycle.
**Severity**: Low

### 13.2 `listen` event handlers accumulate on repeated `initProgressListener` calls
**File**: `src/stores/download-execution-store.ts:203-274`
**Issue**: `initProgressListener` is called in `RootLayout.tsx:36` every mount. If the component re-mounts (React strict mode double-fire, or re-render), the old event listeners are cleaned up by the returned cleanup function. But if cleanup fails (throws), listeners accumulate and duplicate event processing occurs.
**Severity**: Low

### 13.3 `emit_item_update` fires after queue lock released
**File**: `src-tauri/src/commands/download.rs:98-99`
**Issue**: `emit_item_update` acquires a new lock via `queue.lock().unwrap().snapshot()`. Between the mutex release in the caller and this lock acquisition, another thread may have modified the item. The emitted snapshot could be stale.
**Severity**: Low

---

## 14. Logging & Observability

### 14.1 Timestamps in logs use UNIX epoch seconds
**File**: `src-tauri/src/logging.rs:41-46`
**Issue**: `now()` returns `d.as_secs().to_string()` — seconds since epoch with no timezone info. Debugging across timezones or correlating logs with system events is needlessly difficult.
**Severity**: Low

### 14.2 Log file handle silently lost on lock contention
**File**: `src-tauri/src/logging.rs:24-28`
**Issue**: `log_file().lock()` returns `Err` if the mutex is poisoned. After that, no log entries go to the file (only stderr). No diagnostic for this condition exists.
**Severity**: Low

### 14.3 Frontend logger suppresses debug in production
**File**: `src/shared/lib/logger.ts:6`
**Issue**: `if (!isDev && level === 'debug') return` — debug logs are dropped in production builds. If a user reports an issue, debug-level diagnostics are unavailable.
**Severity**: Low

---

## Summary by Severity

| Severity | Count | Key items |
|----------|-------|-----------|
| **Critical** | 4 | 5.1 (playlist cancel broken), 6.1 (hardcoded mp4 path), 6.2 (delete-before-rename data loss), 9.4 (stuck Converting) |
| **High** | 12 | 3.3 (H.265 silently maps to H.264), 4.3 (path traversal), 4.7 (unbounded concurrency), 5.1, 7.1 (non-atomic queue write), 7.3 (silent panic), 7.5 (filenamePattern dropped), 8.1 (cancel race), 8.3 (resume duplicates), 9.2 (no checksum on update), 10.1 (locale progress), 12.1 (SSRF) |
| **Medium** | 23 | 1.1, 2.2, 2.3, 2.8, 3.1, 3.2, 4.2, 4.4, 4.5, 5.2, 5.3, 5.4, 5.6, 5.7, 7.1, 7.2, 7.4, 8.2, 8.4, 8.5, 11.1, 11.2, 12.2, 12.3, 12.4 |
| **Low** | 20+ | Remaining entries |

---

*Generated from codebase audit — no changes applied.*
