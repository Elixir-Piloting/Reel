# YTMate Edge-Case Remediation — Design

> **Merges all 50+ items from `EDGE_CASES.md` into the existing `2026-07-21-ytmate-full-remediation.md` plan phases.**
> Severity in brackets: [C]ritical, [H]igh, [M]edium, [L]ow.

---

## Phase 1: Foundation — Shared Utilities & Dead Code Removal

### 1A. Logger persist debug in production (#14.3) [L]
**Files:** `src/shared/lib/logger.ts`
**Fix:** Remove the `if (!isDev && level === 'debug') return` guard. Instead, route debug logs to a Tauri command that writes to the app log file (`app_data_dir/ytmate.log`). Keep the guard only for console output.
**Verification:** Debug-level logs appear in the log file in production builds.

### 1B. Encoding key mismatch frontend↔backend (#3.3) [H]
**Files:** `src-tauri/src/commands/download.rs:119-127`
**Fix:** Backend encoding matching currently passes both `"mp4_h264"` and `"mp4_h265"` to `"mp4"`. Fix by adding explicit match arms that distinguish them:
- `"mp4_h264"` → `mergeFormat: "mp4"`, no postproc args (default yt-dlp H.264)
- `"mp4_h265"` → `mergeFormat: "mp4"`, add ffmpeg postprocessor args `-c:v libx265` to re-encode. This is a **re-encode pipeline change**, not just a config tweak — most source streams aren't already H.265, so ffmpeg must transcode. Document that this is slower and quality-lossy compared to passthrough.
- All other keys map as currently
**Verification:** Selecting "MP4 (H.265/HEVC)" in the UI does not produce identical output to "MP4 (H.264)".

---

## Phase 2: State Management Split

### 2A. Migrate stores from sessionStorage to localStorage (#1.4) [M]
**Files:** `src/stores/analysis-store.ts`, `src/stores/download-execution-store.ts`, `src/stores/options-store.ts`, `src/stores/playlist-store.ts`
**Fix:** Change `storage: createJSONStorage(() => sessionStorage)` → `storage: createJSONStorage(() => localStorage)` in all four persisted stores. This prevents data loss on app restart.
**Verification:** After restarting the app, previous analysis results, options, and playlist state survive.

### 2B. Quality stored by format_id, not label (#3.1) [M]
**Files:** `src/stores/analysis-store.ts:144-146`
**Fix:** `selectedQuality` is set to `arr[0].label` (e.g., `"1080p (25.3MB)"`). Change to store `format_id`. The options-store `selectedQuality` field becomes the format_id string. The quality selector reads from `qualityOptions` array but stores/uses the `value` (format_id), not the `label`.
**Verification:** Switching between two videos with different format arrangements doesn't silently default on quality.

### 2C. Range slider stale endTime guard (#3.4) [L]
**Files:** `src/features/download-options/RangeSelector.tsx:17-24`
**Fix:** The `prevMax` ref already handles the switch — no change needed. But add a `useEffect` that resets both `startTime` and `endTime` to `[0, maxTime]` when `metadata` object reference changes (new analysis).
**Verification:** Switching videos resets the range slider to full duration.

### 2D. timeToSeconds NaN guard (#3.5) [L]
**Files:** `src/lib/utils.ts:26-31`
**Fix:** Add validation: `if (parts.some(isNaN)) return 0;` after `parts.map(Number)`. Also guard in the options-store `setStartTime`/`setEndTime` setters.
**Verification:** Entering "abc" in a time input defaults to 0 instead of NaN.

### 2E. TitleBar isMaximized stale (#11.5) [L]
**Files:** `src/components/layout/TitleBar.tsx:11`
**Fix:** Use Tauri's window `onResize`/`onMove` events to update `isMaximized` state reactively. No polling fallback needed — Tauri reliably emits these events on platform window-state changes including Win+Arrow and double-click title bar.
**Verification:** Maximizing via Win+Arrow updates the icon immediately.

---

## Phase 3: Architecture Reorganization

### 3A. buildQualityOptions respect show_all_formats (#3.2) [M]
**Files:** `src/stores/analysis-store.ts:130-139`, `src-tauri/src/models/mod.rs:105-112`
**Fix:** Read `show_all_formats` from the store/settings inside `buildQualityOptions`. **First verify** that `show_all_formats` exists in the `AppSettings` Rust struct (src-tauri/src/models/mod.rs) — if it doesn't, add it. This prevents 7.5-class bugs where the frontend references a field the backend doesn't have.
When `show_all_formats` is true, skip the height-based dedup and emit all formats. Pass `format_id` and `codec` info so the UI can display them.
**Verification:** With "show all formats" enabled, the quality selector shows 60fps, different codec, and different bitrate variants for the same resolution.

### 3B. URL history normalize tracking params (#1.3) [L]
**Files:** `src/features/url-input/useUrlHistory.ts:19-26`
**Fix:** Add a `normalizeUrl(url)` helper that strips common tracking params (`si`, `feature`, `utm_*`, etc.) before dedup comparison. Use the normalized URL for the dedup key, but store the original URL for analysis.
**Verification:** Pasting `youtube.com/watch?v=abc&si=xyz` and `youtube.com/watch?v=abc&feature=shared` produces one history entry.

---

## Phase 4: Rust Backend Cleanup

### 4A. URL validation before yt-dlp (#1.1, #12.1) [M→H]
**Files:** `src-tauri/src/commands/analyze.rs:169`
**Fix:** Add a `validate_url(url: &str)` function at the top of `analyze_video`:
- Reject empty/whitespace-only strings
- Reject non-http(s) schemes (`file://`, `javascript:`, `data:`, etc.)
- Reject string that doesn't contain a valid TLD or a known domain pattern
- Return `Err(AppError::InvalidUrl(reason))` with a user-friendly message
**Verification:** Pasting `javascript:alert(1)` or `file:///etc/passwd` shows "Invalid URL" instead of passing to yt-dlp.

### 4B. Strict UTF-8 parsing (#2.1) [M]
**Files:** `src-tauri/src/commands/analyze.rs:188`
**Fix:** Replace `String::from_utf8_lossy(&output.stdout)` with `String::from_utf8(output.stdout).map_err(|e| AppError::Utf8Error(e.to_string()))?`. This surfaces corrupt output as an error instead of silently substituting replacement characters.
**Verification:** A corrupt stdout produces an error message instead of garbage metadata.

### 4C. Missing JSON fields surface errors (#2.2) [M]
**Files:** `src-tauri/src/commands/analyze.rs:43-51`
**Fix:** Replace `unwrap_or("Unknown")` / `unwrap_or(0.0)` with proper error propagation. For critical fields (title, duration), use `.ok_or(AppError::MissingField("title"))?`. For non-critical fields (channel), keep `unwrap_or` but log a warning.
**Verification:** If yt-dlp returns JSON without a `title` field, the analysis fails with a clear error instead of showing "Unknown".

### 4D. Single-entry playlist detection (#2.3) [H]
**Files:** `src-tauri/src/commands/analyze.rs:193-194`
**Fix:** Change `entries.len() > 1` to `entries.len() >= 1`. A playlist with exactly 1 entry should be treated as a playlist, not a single video.
**Verification:** A YouTube URL that is a playlist containing 1 video shows playlist UI, not single-video UI.

### 4E. Thumbnail URL validation (#2.4) [L]
**Files:** `src-tauri/src/commands/analyze.rs:126-136`
**Fix:** Before constructing `https://i.ytimg.com/vi/{id}/mqdefault.jpg`, validate that the extracted video ID matches `[a-zA-Z0-9_-]{11}` (YouTube video ID format). If not, return `None` instead of a broken URL.
**Verification:** Non-YouTube URLs or invalid video IDs produce no thumbnail (or a fallback icon) instead of a broken image.

### 4F. Filesize estimation from bitrate (#2.5) [L]
**Files:** `src-tauri/src/commands/analyze.rs:111`
**Fix:** When both `filesize` and `filesize_approx` are null, compute an estimate: `tbr * duration / 8` (where `tbr` is total bitrate in kbps from the JSON). Emit as `~XX MB` in the frontend display.
**Verification:** DASH formats without filesize display "~123 MB" instead of empty parentheses.

### 4G. Resolution from format_note normalization (#2.6) [L]
**Files:** `src-tauri/src/commands/analyze.rs:85-88`
**Fix:** Normalize `format_note` strings before passing to the frontend: strip trailing digits (e.g., `"720p60"` → `"720p"`), map known non-numeric values (`"medium"` → `"480p"`, `"hd720"` → `"720p"`). Fall through to existing `height` if available.
**Verification:** "720p60" format correctly maps to the "720p" quality bucket.

### 4H. Empty playlist detection (#2.8) [M]
**Files:** `src-tauri/src/commands/analyze.rs:192-195`
**Fix:** After parsing: if `entries` is `Some(vec![])` (empty array), return `Err(AppError::EmptyPlaylist)` instead of treating it as a single video with no formats.
**Verification:** A playlist URL with 0 videos shows a clear "Playlist is empty" error.

### 4I. Queue schema mismatch handling (#7.4) [M]
**Files:** `src-tauri/src/commands/download.rs:48-52`
**Fix:** When `data.version != QUEUE_SCHEMA_VERSION`, log the mismatch with both versions and attempt migration (for known schema bumps) or preserve the old data and start fresh. Never silently discard the queue.
**Verification:** After a schema version change, the old queue data is either migrated or logged, not silently dropped.

### 4J. Settings parse error logging (#7.6) [M]
**Files:** `src-tauri/src/commands/settings.rs:13`
**Fix:** Replace `serde_json::from_str(&data).unwrap_or_default()` with a match that logs parse errors: `match serde_json::from_str(&data) { Ok(s) => s, Err(e) => { log::warn!("Failed to parse settings: {e}"); AppSettings::default() } }`.
**Verification:** A corrupted `settings.json` logs a warning instead of silently resetting.

### 4K. Update integrity check (#9.2) [H]
**Files:** `src-tauri/src/commands/update.rs:5-23`
**Fix:** Rewrite `update_ytdlp`:
1. Fetch the latest release metadata from GitHub API to get the published SHA256/SHA512 hash
2. Download to a temp file in the same directory
3. Verify the downloaded file against the published hash. If no hash is published, at minimum verify PE magic bytes (`MZ`) and check the file is a valid executable via `sigcheck` equivalent
4. Compare version with current binary before replacing (skip if same)
5. Atomically replace via rename: rename current → backup, rename temp → current
6. If any step fails, restore from backup and return error
**Verification:** A failed/interrupted update leaves the original binary intact, not a truncated exe.

### 4L. SSRF mitigation (#12.1) [H]
**Files:** `src-tauri/src/commands/analyze.rs:169-181`
**Fix:** (Covered by 4A — URL validation rejects non-http(s) schemes before reaching yt-dlp).

### 4M. Path traversal in sanitize_filename (#4.3, #12.2) [H]
**Files:** `src-tauri/src/commands/download.rs:80-83`
**Fix:** Extend `sanitize_filename` to:
- Strip null bytes (`\0`) and control characters (0x00-0x1F)
- Strip `..` path components (or `./` and `../`)
- Collapse consecutive underscores
- Apply Unicode NFKC normalization
- Truncate to 200 bytes at a UTF-8 char boundary (use `char_indices()` to find the split point, never split in the middle of a multi-byte character)
**Verification:** A video titled `../../malicious` becomes `__malicious.mp4`, not a file written outside the output directory.

### 4N. Output directory validation (#12.3) [M]
**Files:** `src-tauri/src/commands/download.rs:260-262`
**Fix:** Validate that `output_dir` is an absolute path (`Path::is_absolute()`). Do NOT restrict which absolute path the user can choose — a download manager should let users pick arbitrary save directories. The traversal escape concern is handled by 4M (filename sanitization). Just ensure the path is absolute and writable.
**Verification:** An empty or relative output_dir shows an error; a non-default directory like `D:\videos` works fine.

### 4O. ISO 8601 timestamps in logs (#14.1) [L]
**Files:** `src-tauri/src/logging.rs:41-46`
**Fix:** Replace `d.as_secs().to_string()` with a formatted ISO 8601 string including timezone offset.
**Verification:** Log lines show `2026-07-25T12:00:00+05:30` instead of `1787654400`.

### 4P. Log file handle reconnection (#14.2) [L]
**Files:** `src-tauri/src/logging.rs:24-28`
**Fix:** On lock contention, log to stderr and attempt to reopen the log file on the next write (with a 5-second cooldown between retries).
**Verification:** Log entries are not permanently lost after a transient lock contention.

---

## Phase 5: UX and Interaction Improvements

### 5A. canDownload output directory check (#11.1) [M]
**Files:** `src/pages/DownloadPage.tsx:44`
**Fix:** In the `canDownload` computation, add an async check or sync `fs::metadata` call via Tauri to verify the directory exists. Since synchronous IPC would be heavy, add a `verifyOutputDir` Tauri command and cache the result (invalidate on directory change).
**Verification:** Clicking Download with a removed USB drive shows "Output directory not found" instead of a failed download.

### 5B. Empty formats after analysis (#11.2) [M]
**Files:** `src/pages/DownloadPage.tsx:57-86`
**Fix:** Add a check: when `phase === "ready"` but `qualityOptions` is empty, show a descriptive state "No downloadable formats found" with possible reasons (livestream, members-only, geo-blocked).
**Verification:** A video with no available formats shows a helpful message, not a blank ready state.

### 5C. History polling guard (#11.3) [L]
**Files:** `src/pages/DownloadsPage.tsx:23-24`, `src/features/download-history/HistoryPanel.tsx:25-26`
**Fix:** Only poll `dataService.getQueue()` at 2s intervals when there are active items (status `"Downloading"` or `"Queued"`). When all items are completed/failed/cancelled, poll at 30s intervals or stop entirely. Use a `hasActiveDownloads` check from the queue data.
**Verification:** With no active downloads, the queue is not polled every 2 seconds.

### 5D. "starting..." timeout guard (#11.4) [L]
**Files:** `src/features/download-execution/DownloadProgress.tsx:41-48`
**Fix:** Add a timeout: if `!downloadItem && isDownloading` for more than 5 seconds, show a "Download may have failed" state with a retry option instead of "Starting download..." indefinitely.
**Verification:** If enqueue fails silently, the UI transitions to an actionable error within 5 seconds.

### 5E. analyzeGen error handling (#13.1) [L]
**Files:** `src/stores/analysis-store.ts:110-113`
**Fix:** Already handled — the gen counter check prevents stale errors. Ensure `set({ phase: 'error', error: String(e) })` also resets `metadata` and `formats` so the error state is clean.
**Verification:** After an error, retrying works without leftover state.

### 5F. Event listener cleanup robustness (#13.2) [L]
**Files:** `src/stores/download-execution-store.ts:203-274`
**Fix:** Use idempotent listener registration — store each `UnlistenFn` in a ref and call it before re-registering. If `unlistenProgress()` or `unlistenItem()` throws, log the error but do NOT call `listen()` again in the catch handler (that risks creating the duplicate-listener bug). Instead, the next call to `initProgressListener` will start fresh because the ref was cleared. Never retry registration from inside a cleanup handler.
**Verification:** React StrictMode double-mount doesn't cause duplicate event processing.

### 5G. Playlist cancel uses UUID not URL (#5.1) [C]
**Files:** `src/features/playlist/PlaylistSelector.tsx:152`, `src/stores/playlist-store.ts:10`
**Fix:** The cancel button passes `entry.id` (which is the video URL). Change the `PlaylistEntry` interface to include a `downloadId` field (the UUID from `enqueue_download`). When the download starts, store the UUID. The cancel button uses `entry.downloadId` instead of `entry.id`.
**Verification:** Clicking cancel on a playlist item actually stops the download.

---

## Phase 6: Visual Design Overhaul

No edge-case items to add (cosmetic items are covered by the existing plan).

---

## Phase 7: Performance and Robustness

### 7A. Retry backoff (#4.5) [M]
**Files:** `src-tauri/src/commands/download.rs:210-544`
**Fix:** Add delay between retries: `tokio::time::sleep(Duration::from_secs(2u64.pow(attempt)))`. First retry waits 2s, second retry waits 4s, etc.
**Verification:** Retries don't happen instantly — they wait with exponential backoff.

### 7B. Locale-safe progress regex (#10.1) [H]
**Files:** `src-tauri/src/models/progress.rs:16-17`
**Fix:** Change regex from `(\d+\.?\d*)%` to `(\d+[.,]?\d*)%` — accept comma as decimal separator. Normalize to `.` before parsing as f64.
**Verification:** Progress lines with `1,5%` (Italian locale) parse correctly.

### 7C. Progress >100% clamp (#10.2) [L]
**Files:** `src-tauri/src/models/progress.rs:17`
**Fix:** In `emit_progress`, `clamp(progress, 0.0, 100.0)` before emitting. Keep the parsed value for queue storage but clamp the emitted value.
**Verification:** Progress display never shows "105%".

### 7D. Final progress 100% on completion (#10.3) [L]
**Files:** `src-tauri/src/commands/download.rs:363-368`
**Fix:** After the download loop exits (before ffmpeg conversion), emit one final progress event with `100.0` to ensure the UI shows 100% even if the last throttled value was lower.
**Verification:** Download completes with progress showing 100%, not 87%.

---

## Phase 8: Settings and History

### 8A. filenamePattern persists to backend (#7.5) [H]
**Files:** `src-tauri/src/models/mod.rs:105-112`, `src/features/settings/SettingsPage.tsx:94`
**Fix:** Add `filename_pattern: String` field to `AppSettings` struct with serde default. In `save_settings`, ensure the value is received and stored. On the Rust side, pass the pattern to yt-dlp's `--output` template.
**Critical:** The sanitize_filename from 4M must be applied to the *substituted values* (title, channel, etc.) after yt-dlp interpolates them, NOT to the template pattern string itself. The pattern uses yt-dlp's `%(title)s` syntax which depends on `%`, `(`, `)` — sanitizing the pattern would break all custom filename patterns. Pass the raw template to `--output`, then sanitize the resolved filename before the file is written. Alternatively, use yt-dlp's `--output` with a `--exec` postprocessor that renames the file after download. Either way: the sanitizer operates on resolved values, never on the template pattern.
**Verification:** Setting a filename pattern like `../../escape` in UI produces a safe output path, not a directory escape.

### 8B. Playlist entry metadata (#5.5) [L]
**Files:** `src/stores/download-execution-store.ts:127-129`
**Fix:** Populate `channel` from the playlist entry's `channel` field (if available in the yt-dlp JSON). For `thumbnail_url`, use the entry's own thumbnail or the extracted one.
**Verification:** Playlist items in the queue show channel name and thumbnail.

---

## Phase 9: Download Execution & Critical Fixes

### 9A. Retry thumbnail fallback visible to user (#4.6) [L]
**Files:** `src-tauri/src/commands/download.rs:215`
**Fix:** `let embed_thumbnail = attempt == 1;` disables thumbnail embedding on retry without indication. Pass `embed_thumbnail` through the progress event or add a distinct status like `"Retrying (no thumbnail)"` so the frontend can show a note.
**Verification:** On retry, the UI shows a note that thumbnail embedding was skipped.

### 9B. Cancel from DownloadsPage race (#8.4) [M]
**Files:** `src/features/download-history/DownloadList.tsx:101-106`
**Fix:** When `cancel_download` returns false (process not found), the item may still start because the async task hasn't called `process_download` yet. Add a pre-emptive cancellation flag in the queue: set item status to `Cancelled` in the queue BEFORE trying to kill the process. The spawned task checks this flag before starting.
**Verification:** Clicking cancel immediately after enqueue doesn't result in a download starting.

### 9C. cancel_all misses queued items (#8.5) [M]
**Files:** `src-tauri/src/commands/download.rs:599-619`
**Fix:** The active HashMap only contains currently-downloading items. For queued items (no process yet), the spawned task may proceed despite the status being overwritten to Cancelled. Fix: iterate queue items, set them to Cancelled, and add a cancellation token that the spawn loop checks before calling `process_download`.
**Verification:** Cancelling all stops even items that haven't begun processing yet.

### 9D. Hardcoded .mp4 input path (#6.1) [C]
**Files:** `src-tauri/src/commands/download.rs:423`
**Fix:** Replace `format!("{}/{}.mp4", output_dir, safe_filename)` with a dynamic extension: track the file extension through the pipeline explicitly (from the encoding config's `ext` field, passed into `process_download` as part of the request). Do NOT rediscover the extension by scanning the directory — a stale partial file with the same basename but a different extension would produce a false match. The extension is known state; pass it as such.
**Verification:** Premiere mode with MKV encoding finds the correct input file instead of erroring.

### 9E. Atomic delete-before-rename (#6.2) [C]
**Files:** `src-tauri/src/commands/download.rs:451-452`
**Fix:** Swap the order:
1. Rename temp file to input path (overwrites if exists)
2. Delete original only if rename succeeded
Also wrap in a guard: capture original filename before conversion, use `.tmp` extension for temp, then atomically rename to final name. On rename failure, keep original file intact.
**Verification:** If rename fails (disk full, AV scan), the original downloaded file is not deleted.

### 9F. Temp file cleanup on ffmpeg failure (#6.3) [M]
**Files:** `src-tauri/src/commands/download.rs:437-438`
**Fix:** In the `Err(_)` branch of ffmpeg spawn, use a `Drop` guard (the `scopeguard` crate or a hand-rolled guard struct) to clean up both the yt-dlp output and any partial ffmpeg output. Log the cleanup attempt. Update `Cargo.toml` to add `scopeguard` as a dependency if using the crate approach.
**Verification:** If ffmpeg crashes mid-conversion, orphaned partial files are deleted.

### 9G. FFmpeg progress emission (#6.4, #9.4) [L→C]
**Files:** `src-tauri/src/commands/download.rs:447`, `src-tauri/src/commands/download.rs:436-438`
**Fix:**
- Parse ffmpeg progress and emit real conversion percentage: `let pct = (ffmpeg_time / total_duration) * 100.0` (requires passing `total_duration` into the conversion block).
- On ffmpeg spawn failure (`Err(_)`), mark the item as `Failed` with the ffmpeg error message and emit an `download-item-update` event so the frontend transitions out of "Converting".
**Verification:** During ffmpeg conversion, the progress bar moves. If ffmpeg fails, the item shows "Failed" instead of stuck "Converting".

### 9H. Premiere audio mode guard (#6.5) [L]
**Files:** `src-tauri/src/commands/download.rs:414`
**Fix:** Already handled — the `if premiere_mode && download_type == DownloadType::Video` guard is correct behavior. No change needed.

### 9I. Cancel race condition (#8.1) [H]
**Files:** `src-tauri/src/commands/download.rs:513-514` vs `src-tauri/src/commands/download.rs:563-565`
**Fix:** Add an atomic `cancelled` flag per item. Before setting status to `Failed` or retrying in the Terminated handler, check the flag. If cancelled, skip status update. Use `Arc<AtomicBool>` shared between `cancel_download` and `process_download`.
**Verification:** Cancelling a download doesn't result in "Failed" status flickering after "Cancelled".

### 9J. Pause/resume rewrite (#8.2, #8.3) [H]
**Files:** `src-tauri/src/commands/download.rs:654-703`
**Fix:** Current pause kills the process and resume starts fresh (duplicate entry + 0% restart). Rewrite using **kill + `--continue`** (the only approach consistent with yt-dlp's design).
- **Pause:** Kill the child process but record the partial output filename. Set status to `Paused`.
- **Resume:** Spawn a new yt-dlp process with the same format selection, but add `--continue` and point `--output` at the existing partial file. Do NOT create a new queue entry — reuse the existing item.
- **Assumption to verify:** `--continue` depends on the source server supporting HTTP Range requests. Some CDNs (e.g., Cloudflare Stream, some DASH manifests) don't, in which case yt-dlp re-downloads from scratch. This is a server-side limitation; the frontend should still show progress starting from 0% in that case, but the item shouldn't be duplicated.
- **Pause during ffmpeg conversion:** If the user hits pause while status is `"Converting"` (ffmpeg running), pause kills the process and falls back to cancel+restart-from-scratch on resume — ffmpeg doesn't support mid-transcode resume. The pause button should be disabled during `"Converting"` status to avoid misleading the user. This is a frontend-only carve-out: disable the pause button when `downloadStatus === "Converting"`.
- Requires a quick prototype/spike on 3-4 real YouTube URLs to confirm `--continue` behavior is acceptable before folding into a phase plan.
**Verification:** Pausing and resuming does not create a duplicate queue entry. If the server supports range requests, progress resumes from the partial point.

### 9K. Unbounded process spawn (#4.7) [H]
**Files:** `src-tauri/src/commands/download.rs:172-174`
**Fix:** Introduce a `Semaphore::new(max_concurrent)` at the module level. Each `process_download` call acquires a permit before spawning. The semaphore is initialized from the settings (default 3).
**Verification:** 50 enqueue calls result in at most 3 simultaneous yt-dlp processes.

### 9L. Atomic queue write (#7.1) [H]
**Files:** `src-tauri/src/commands/download.rs:37-39`
**Fix:** Replace `std::fs::write(&path, json)` with:
1. Write to `queue.json.tmp`
2. `std::fs::rename("queue.json.tmp", "queue.json")` — this is atomic on the same filesystem
**Verification:** A crash mid-write leaves either the old intact queue or the new file, never a truncated file.

### 9M. Mutex poison handling (#7.2) [M]
**Files:** `src-tauri/src/queue/mod.rs:24-27`
**Fix:** Replace `.lock().unwrap()` with a helper that uses `PoisonError::into_inner()` to recover the lock guard — the data behind a poisoned mutex is almost always structurally intact. Since `into_inner()` returns the live in-memory struct directly, no deserialization/validation step is needed; the struct's invariants are intact. Never silently clear the queue on poison.
```rust
fn lock_queue(q: &Mutex<DownloadQueue>) -> MutexGuard<DownloadQueue> {
    match q.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::warn!("Queue mutex poisoned, recovering inner data");
            poisoned.into_inner()
        }
    }
}
```
**Verification:** A panicked thread doesn't take down the app AND doesn't silently wipe the queue.

### 9N. Silent async panic (#7.3) [H]
**Files:** `src-tauri/src/commands/download.rs:172-174`
**Fix:** Wrap the spawned future body in a catch_unwind: `let result = std::panic::AssertUnwindSafe(process_download(...)).catch_unwind().await`. On panic, log the panic payload and emit a `Failed` event for the item.
**Verification:** A panic in the download task marks the item as Failed and notifies the frontend.

### 9O. Orphaned subprocess guard (#9.5) [M]
**Files:** `src-tauri/src/commands/download.rs:172-544`
**Fix:** Create a `ProcessGuard` struct that implements `Drop`. When the guard is dropped (task cancellation, panic), it kills the child process and removes the entry from `active`. Wrap each spawned task with a guard.
**Verification:** If a task is cancelled or panics, the yt-dlp child process is killed.

### 9P. Output directory creation (#4.2) [M]
**Files:** `src-tauri/src/commands/download.rs:294-296`
**Fix:** Replace the no-op `if let Ok(_meta) = std::fs::metadata(&output_dir) { }` with:
- `std::fs::create_dir_all(&output_dir)` — create if missing
- Check accessibility (write permission) via `std::fs::write(output_dir.join(".tmp_write_test"), "")` + cleanup
- On failure, return `Err(AppError::StorageError)` with actionable message
**Verification:** Downloading to a non-existent directory auto-creates it. Downloading to a read-only directory shows a clear error.

### 9Q. +bestaudio fallback per entry (#4.4, #5.4) [M]
**Files:** `src-tauri/src/commands/download.rs:222`, `src/stores/download-execution-store.ts:104-105`
**Fix:**
- For single videos with `!has_audio`, try `format_id + "+bestaudio"`. If that fails, fall back to `"bestvideo+bestaudio"` (merge).
- For playlists, instead of applying the same `format_id` to all entries (which doesn't transfer across videos), derive a quality tier from the user's `format_id` selection (via 2B) and pass a tier string. Add a bridging function: given the selected `format_id`, look up its resolution/height from the current video's format list, then build yt-dlp's `/` syntax: `"bestvideo[height<=N]+bestaudio/best"`. This runs per-playlist-entry so each video resolves its own best match within the tier.
- **Bridge function contract:** `fn quality_tier_from_format_id(format_id: &str, formats: &[FormatInfo]) -> String` — resolves the format_id to its height, returns `"N"` for the tier. Called once per playlist item with that item's available formats (fetched ahead of time or from a best-effort cache). Falls back to `"best"` if height can't be determined.
**Verification:** Playlist entries with different available formats each get the best matching format.

### 9R. Sidecar missing error (#9.3) [M]
**Files:** `src-tauri/src/commands/download.rs:298-328`
**Fix:** When the sidecar binary is not found, return a structured error with a repair action: `AppError::SidecarNotFound(path)`. The frontend shows a "Download yt-dlp" button instead of an opaque error.
**Verification:** If yt-dlp is deleted, the UI shows a repair/reinstall action.

### 9S. Deferred promise timeout (#5.2) [H]
**Files:** `src/stores/download-execution-store.ts:134-139`
**Fix:** The existing 30-minute timeout is too long. Reduce to 5 minutes. Also add a heartbeat mechanism: if the item status hasn't changed in 60 seconds while downloading, treat as stalled and mark as Failed.
**Verification:** A download that stalls without emitting events gets marked as Failed within 5 minutes, not 30.

### 9T. Race between deferred and queue poll (#5.3) [M]
**Files:** `src/stores/download-execution-store.ts:155-158`
**Fix:** Instead of re-fetching the full queue after deferred resolves, use the event payload directly (the `download-item-update` event carries the full item). The deferred resolves with the final item data.
**Verification:** The final item lookup doesn't miss items that were removed between events.

### 9U. Concurrency applies globally (#5.6) [M]
**Files:** `src/stores/download-execution-store.ts:106`
**Fix:** The `max_concurrent_downloads` setting currently only limits playlist workers. Use the Rust-side semaphore from 9K (which applies globally) to enforce the limit across both single and playlist downloads.
**Verification:** Setting concurrency to 1 limits both single and playlist downloads to one at a time.

### 9V. Phase transition before workers finish (#5.7) [M]
**Files:** `src/stores/download-execution-store.ts:177-178`
**Fix:** Add a completion guard: after `Promise.all(workers)`, wait for a short debounce (500ms) before setting `isDownloading: false` and `phase: 'completed'`. This ensures any lagging event emissions are captured.
**Verification:** The phase doesn't transition to "completed" while the last item's progress event is still in flight.

### 9W. Analysis cache capacity (#2.7) [L]
**Files:** `src/shared/lib/analysis-cache.ts:8-9`
**Fix:** Add a max cache size (50 entries). When inserting, evict the oldest entry if at capacity. Use a `Map` (insertion order retains) and delete the first key.
**Verification:** Analyzing 60 unique URLs evicts the oldest 10 from cache.

### 9X. CSP non-null (#12.4) [M]
**Files:** `src-tauri/tauri.conf.json:25`
**Fix:** Set `"csp": "default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline';"` instead of `null`. This prevents arbitrary script execution while allowing images from HTTPS and inline styles (needed for Tailwind).
**Verification:** The app loads and functions correctly with the CSP applied.

### 9Y. Failed(String) serialization (#4.8) [M]
**Files:** `src-tauri/src/models/mod.rs:91`, `src/stores/download-execution-store.ts:242`
**Fix:** The current `DownloadStatus::Failed(String)` serializes as `{"Failed": "error message"}`. Switch to a flat model: `status: String` + `error: Option<String>`. This eliminates fragile frontend parsing.
**Verification:** Frontend parses status without custom key extraction.

---

## Verification

- [ ] `cargo check` passes with no warnings
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npx vite build` produces a successful build
- [ ] Critical path: paste URL → analyze → configure settings → download → verify file on disk
- [ ] Playlist path: paste playlist → select items → download batch → all items complete
- [ ] Cancellation: cancel mid-download → item shows Cancelled, not Failed
- [ ] Premiere mode with non-MP4 encoding produces correct output
- [ ] Filenames with special characters (`..`, null bytes, Unicode) are sanitized safely
- [ ] URL validation rejects `file://` and `javascript:` URIs
- [ ] Progress appears in both `.` and `,` decimal locales
- [ ] Queue file is never left in a truncated state after crash
- [ ] Settings with `filename_pattern` survive restart
