# Runtime Binary Management, Premiere Toggle, Downloads\REEL — Design

Date: 2026-08-11

## Summary

Three coordinated changes to `ytmate`:

1. **Runtime binary management** — stop treating `yt-dlp` and `ffmpeg` as immutable bundled sidecars. Keep both bundled as a bootstrap/offline fallback, but operate the "live" copies out of the app-data dir (`%APPDATA%\com.dog.reel\bin`) so they can be updated in place without admin rights. Update `yt-dlp` on every launch (background, non-blocking); update `ffmpeg` opportunistically on a ~7 day cadence. Expose a subtle version/status indicator in Settings so users can self-diagnose stale tools.
2. **Premiere toggle on the download page** — add a per-download "Premiere-compatible" toggle in the page's option column (below Encoding), bound to the existing `premiereMode` in the options store; remove the dead `auto_convert_premiere` setting and its Settings toggle.
3. **Default download folder** — default becomes `%USERPROFILE%\Downloads\REEL`, including for existing installs whose stored `default_download_folder` is empty.

## 1. Binary locations and bootstrap

Binaries the app runs are expected at:

```
<app_data_dir>/bin/yt-dlp.exe
<app_data_dir>/bin/ffmpeg.exe
```

`app_data_dir` is Tauri's `{FOLDERID_RoamingAppData}/{identifier}` = `%APPDATA%\com.dog.reel` — the same directory the queue (`download.rs:44`) and logs (`logging.rs:43-45`) already use. Not Program Files, so in-place updates never need elevation.

**Bundled copies remain** in `externalBin` (`tauri.conf.json:42-45`) as a bootstrap/offline fallback, exactly as shipped today. On startup the app ensures `bin\yt-dlp.exe` and `bin\ffmpeg.exe` exist by copying from the bundled resource copies if missing. From then on, the app-data copies are authoritative and the bundled ones are only ever a recovery source.

New module `src-tauri/src/binaries.rs` (`mod binaries;` in `lib.rs`) owns:

- `bin_dir(app: &AppHandle) -> PathBuf`
- `ensure_bootstrapped(app) -> Result<()>` — create bin dir; copy bundled `yt-dlp`/`ffmpeg` sidecar files into it if the target is absent.
- `ytdlp_path(app)`, `ffmpeg_path(app) -> PathBuf`
- `installed_version(path) -> Option<String>` — run `<exe> --version`; yt-dlp prints `2026.08.05`, ffmpeg prints `N-...-...` / `6.1`.
- Runtime update/flags (see §3).

## 2. Update policy

### yt-dlp — every launch

- After startup (short, async, fired from `lib.rs` `.setup`), if `auto_update_ytdlp` is enabled (default ON) **or** no yt-dlp exists at all: check latest release via GitHub API, compare with installed, download+replace if newer.
- Uses the existing verified pipeline in `commands/update.rs`: fetch latest release, locate `yt-dlp.exe` asset, verify SHA256 from release notes (PE magic `MZ` fallback), write to temp file, then atomic rename over `bin\yt-dlp.exe` (keep `.bak` during swap).
- **Retarget** `update_ytdlp` from `resource_dir/binaries` (`update.rs:54-59`) to `app_data_dir/bin`.
- Failure (offline, rate-limited, checksum mismatch): leave current file untouched, record `failed` status, next launch retries. Silent — no dialog.

### ffmpeg — opportunistic, weekly

- A persisted timestamp `last_ffmpeg_check` (ISO date string) is read at startup; if older than 7 days (or absent), a background task checks ffmpeg's update feed.
- Update source: BtbN GitHub release `ffmpeg-master-latest-win64-gpl.zip` (includes `libx264`/`libx265` used by the Premiere re-encode and H.265 paths). Download to temp, verify it is a valid ZIP (magic `PK`, CRC-safe extraction), extract `bin/ffmpeg.exe`, run `ffmpeg -version` smoke test, then atomically replace `bin\ffmpeg.exe` (keep `.bak` during swap). On any failure, keep current file and update the timestamp anyway so a flaky network doesn't force a retry every launch.
- ffmpeg never blocks or delays startup regardless of state.

### Launch sequencing

`.setup` (spawned task, not awaited):

1. `ensure_bootstrapped`.
2. Spawn `binary_status` initialization (installed versions).
3. If `auto_update_ytdlp` (or no yt-dlp present) → yt-dlp version check/update.
4. If `last_ffmpeg_check` older than 7 days → ffmpeg check/update; record timestamp.
5. Emit `binary-status` event for the frontend on each transition.

Nothing in this sequence is await-ed by window creation or by download/analyze commands.

## 3. Binary status indicator

New command `binary_status() -> BinaryStatus` and event `binary-status`:

```json
{
  "ytdlp":   { "installed": "2026.08.05", "latest": "2026.08.05", "state": "up_to_date" },
  "ffmpeg":  { "installed": "6.1",        "latest": "6.1",         "state": "up_to_date" }
}
```

`state` ∈ `up_to_date` | `updating` | `stale` | `failed` | `offline` | `missing`. `latest` is cached from the last check so the UI shows something even fully offline.

**Settings → Download Defaults** gains a small "Download tools" block (below the existing toggles) with two muted lines:

- `yt-dlp: v2026.08.05 (up to date)` / `(update failed — offline)` / `(updating…)`
- `ffmpeg: vN (up to date)` / similar

plus an inline **"Update now"** button that triggers an immediate yt-dlp refresh (and ffmpeg when stale), with live status updates via the `binary-status` event. This is the self-diagnosis surface: stale binary → "video won't download" is traceable before asking for support.

The existing `auto_update_ytdlp` Settings toggle now actually works and its default flips to **ON** in both Rust (`models/mod.rs:130`) and the frontend initial state (`settings-store.ts:15`). `DownloadList.tsx:76`'s "Download yt-dlp" button stays and just calls the same command (now targeting app-data).

## 4. Spawn refactor

Replace the three bundled-`sidecar()` spawn sites with absolute-path spawning of the app-data binaries, using `app.shell().command(<path>)` (tauri-plugin-shell v2) which returns the same `Command`/event channel:

- `analyze.rs:284-292` — `app.shell().sidecar("yt-dlp")` → `app.shell().command(ytdlp_path(&app))` (`.output().await` unchanged).
- `download.rs:503-530` — yt-dlp download spawn. `.sidecar("yt-dlp")` → `.command(ytdlp_path(&app))`. The `rx`/`Child`/`ProcessGuard` flow is untouched.
- `download.rs:650-680` — ffmpeg Premiere conversion. `.sidecar("ffmpeg")` → `.command(ffmpeg_path(&app))`.
- `Sidecar`-specific error strings (`error.rs` `AppError::SidecarNotFound`, messages containing "Sidecar") are revisited: missing binary now surfaces via the binary-status indicator and a clearer "yt-dlp not available — Download tools missing" message path. `DownloadList.tsx:72-77`'s sidecar-error detection is updated to match the new failure shape while keeping its "Download yt-dlp" action.

### `--ffmpeg-location` fix (H.265 / merge)

Because the update logic may replace `yt-dlp` with a newer build while `ffmpeg` also lives at a known path, pass `--ffmpeg-location <bin_dir>` in the yt-dlp download args (`download.rs`, video branch, in the same area as `--merge-output-format` / the `mp4_h265` postprocessor args, ~line 412-423). This fixes `mp4_h265` re-encode **and** any video+audio merge that requires ffmpeg, independently of whether ffmpeg is on the system PATH. This replaces the "H.265 gap" documented in `EDGE_CASES.md`.

### Capabilities

`capabilities/default.json` currently scopes `shell:allow-execute`/`shell:allow-spawn` to the two sidecar names (`default.json:18-43`). Arbitrary `command(path)` spawns must be allowed by scope; add entries permitting the app-data bin paths (path-prefix scope for `bin` dir). Exact permission format validated during implementation (`tauri-plugin-shell` scope supports glob/prefix matchers).

## 5. Premiere toggle (page only)

- `DownloadPage.tsx` right-hand option column (`DownloadPage.tsx:89-93`) gains a `PremiereSelector` immediately below `EncodingSelector`: a labeled switch bound to `useOptionsStore(s => s.premiereMode)` / `setPremiereMode` (field already exists in `options-store.ts:11,18,29`).
- Reads as: "Premiere-compatible — re-encode to H.264/AAC for Adobe Premiere".
- The dead `auto_convert_premiere` setting is removed: `models/mod.rs:102` field, `models/mod.rs:131` default, `settings-store.ts` initial state / `types.ts` field, and its toggle at `SettingsPage.tsx:46`. (Serialized settings ignore the removed field via serde `skip_serializing_if`/`default` already tolerated — confirm `AppSettings` deserialization tolerates absence; it does via `serde(default)` behavior of the existing struct? Verified during implementation: add `#[serde(default)]` where needed.)
- Ability to express the pipeline is already present: `premiereMode` is consumed by `startDownload` (`download-execution-store.ts:72,88`) and the Rust pipeline emits `Downloading → Converting (parsed ffmpeg %) → Completed` which both UIs already render (`DownloadProgress.tsx:72,94-96`, `DownloadList.tsx:36,43,95-97`), including disabling Pause during `Converting` (`DownloadList.tsx:101`). No pipeline change is required; the toggle only surfaces the option.

## 6. Default download folder

- `models/mod.rs:126` default becomes `dirs::download_dir()\REEL`.
- `get_settings` (`settings.rs:11-24`) normalizes: if persisted `default_download_folder` is empty, substitute `download_dir()\REEL` (fall-through path), so existing installs whose `settings.json` stores `""` stop having a disabled Download button. Frontend `SettingsPage.tsx:24-41` keeps "Save To"/Browse as an override.
- `download.rs:348` already `create_dir_all`s the output dir on download — the `REEL` folder appears on first download.
- Playlist downloads prepend the playlist title folder to the effective dir (`download-execution-store.ts:116-118`); unchanged.

## 7. Error handling / edge cases

- Any binary update failure is silent and non-blocking; current binary continues to work; state is recorded for the Settings indicator; next challenge retries.
- Fresh install, fully offline: bundled bootstrap copies are installed to `bin\` at startup and the launcher uses them. Downloads work, including Premiere re-encode and H.265, because `--ffmpeg-location` always points at the resolved ffmpeg path (the bundled copy until an update lands).
- `bin\yt-dlp.exe` currently running while an update replaces it: the update uses temp-file + atomic rename, so a live process keeps its mmap'd file; next launch picks up the new one. (Same pattern already used in `update.rs:61-68`.)
- Rate-limited `/corrupted` GitHub response → `failed` state, current file retained.

## 8. Out of scope

- No per-binary download progress UI beyond the Settings line and `updating…` state.
- No configurable ffmpeg mirror/provider.
- No changes to queue, pause/resume, retry, or the playlist pipeline beyond the toggle surfacing `premiereMode`.
- No change to `externalBin`/`resources` in `tauri.conf.json` (both binaries remain bundled).

## Files touched (expected)

Rust: `src-tauri/src/binaries.rs` (new), `lib.rs`, `commands/update.rs`, `commands/settings.rs`, `commands/analyze.rs`, `commands/download.rs`, `models/mod.rs`, `error.rs`, `capabilities/default.json`.
Frontend: `src/features/download-options/PremiereSelector.tsx` (new) + `index.ts`, `src/pages/DownloadPage.tsx`, `src/features/settings/SettingsPage.tsx`, `src/stores/settings-store.ts`, `src/shared/lib/types.ts`, `src/features/download-history/DownloadList.tsx`, `src/shared/lib/data-service.ts`.