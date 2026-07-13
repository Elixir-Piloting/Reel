# YTMate — YouTube Downloader Desktop App

## Overview

YTMate is a clean, modern YouTube downloader desktop app built with Tauri v2 (Rust backend) + React/TypeScript frontend (shadcn/ui, Tailwind CSS, Zustand). Bundles yt-dlp.exe and ffmpeg.exe as sidecar binaries — no user installation required.

## Architecture

**Approach A — Hybrid State Model (Recommended)**

- **Frontend**: Zustand for UI state (selected tab, collapsed sections, input values), React for rendering, shadcn/ui components
- **Backend**: All yt-dlp/ffmpeg execution via Tauri commands, download queue managed in Rust with `Arc<Mutex<Vec>>`, progress streamed via Tauri events
- **Sidecar binaries**: Bundled as `src-tauri/binaries/*-x86_64-pc-windows-msvc.exe`, configured via `externalBin` in `tauri.conf.json`

## Project Setup & Configuration

### Frontend Dependencies
- `tailwindcss` v4 + `@tailwindcss/vite`
- `zustand` for state management
- `lucide-react` for icons
- `class-variance-authority`, `clsx`, `tailwind-merge` for shadcn/ui
- `@radix-ui/*` packages (as required by shadcn components)

### Rust Dependencies
- `tauri-plugin-shell` — spawn yt-dlp/ffmpeg processes
- `tauri-plugin-dialog` — folder picker
- `tauri-plugin-fs` — file existence checks, settings persistence
- `serde` / `serde_json` — JSON serialization
- `reqwest` — download latest yt-dlp.exe for updates
- `regex` — parse yt-dlp progress output

### Sidecar Binaries
```
src-tauri/binaries/
  yt-dlp-x86_64-pc-windows-msvc.exe   (v2026.07.04, from WinGet)
  ffmpeg-x86_64-pc-windows-msvc.exe   (N-124716, from WinGet full build)
```

### Capabilities (Permissions)
```
core:default
opener:default
shell:default, shell:allow-execute, shell:allow-stdin-write
dialog:default, dialog:allow-open
fs:default, fs:allow-read, fs:allow-exists
```

## Rust Backend Architecture

### Module Structure
```
src-tauri/src/
  main.rs                   # Entry point
  lib.rs                    # Tauri builder, plugin/command registration
  commands/
    mod.rs
    analyze.rs              # analyze_url → yt-dlp -J
    formats.rs              # list_formats → yt-dlp -F
    download.rs             # download → queue + worker
    settings.rs             # get/set app settings
    update.rs               # update yt-dlp sidecar
  queue/
    mod.rs                  # DownloadQueue struct (Arc<Mutex<Vec<DownloadItem>>>)
    worker.rs               # Background worker: pop queue → spawn → stream
  models/
    mod.rs                  # VideoMeta, FormatInfo, DownloadItem, AppSettings
    progress.rs             # Parse [download] XX.X% from stdout
```

### Tauri Commands
| Command | Args | Returns |
|---------|------|---------|
| `analyze_url` | `url: String` | `VideoMeta` (title, duration, channel, upload_date, thumbnail_url) |
| `list_formats` | `url: String` | `Vec<FormatInfo>` (format_id, resolution, video_codec, audio_codec, container, fps, filesize) |
| `enqueue_download` | `DownloadRequest` | `DownloadItem` (id, added to queue) |
| `cancel_download` | `id: String` | `bool` |
| `get_queue` | — | `Vec<DownloadItem>` |
| `get_settings` | — | `AppSettings` |
| `save_settings` | `settings: AppSettings` | `()` |
| `browse_folder` | — | `String` (selected path) |
| `update_ytdlp` | — | `()` (downloads latest, replaces sidecar) |

### Progress Streaming
- Worker reads yt-dlp stdout line-by-line in a spawned thread
- Emits `download-progress` event: `{ id, percent: f64, speed: String, eta: String, status: String }`
- Emits `download-complete` event: `{ id, output_path: String, success: bool, error: Option<String> }`
- Emits `convert-progress` event: `{ id, percent: f64 }`

## Frontend Architecture

### Component Tree
```
src/
  App.tsx                       # Theme provider, layout shell
  main.tsx                      # React entry point
  styles.css                    # Tailwind import + global styles
  components/
    ui/                         # shadcn/ui primitives (button, input, card, tabs, etc.)
    layout/
      AppShell.tsx              # Main layout wrapper
    download/
      UrlInput.tsx              # Paste URL + Analyze button
      MetadataCard.tsx          # Thumbnail, title, duration, channel, date
      FormatSelector.tsx        # Format list with codec/container/resolution
      DownloadTypeTabs.tsx      # Video+Audio / Video Only / Audio Only
      PremiereToggle.tsx        # "Premiere Compatible" switch
      DownloadButton.tsx        # Triggers download
      AdvancedSection.tsx       # Collapsible: start time, end time
    queue/
      DownloadQueue.tsx         # List of active/completed items
      DownloadItem.tsx          # Thumb, filename, progress bar, speed, ETA, status
    settings/
      SettingsPage.tsx          # Default folder, theme, auto-update, auto-convert
  stores/
    download-store.ts           # Zustand: URL, metadata, formats, selectedFormatId
    queue-store.ts              # Zustand: queue items (mirrored from Rust via events)
    settings-store.ts           # Zustand: app settings
  lib/
    utils.ts                    # cn(), formatDuration(), formatBytes(), formatDate()
    tauri.ts                    # Typed invoke() wrappers
```

### State Management
- **UI state** (selected tab, collapsed sections, input values) → Zustand `download-store`
- **Queue state** (active downloads, progress) → Rust, mirrored to Zustand `queue-store` via `listen('download-progress')` / `listen('download-complete')`
- **Settings** → Rust persists to `$APPDATA/settings.json`, Zustand `settings-store` mirrors on app start via `invoke('get_settings')`

## Data Flow

### Analyze Flow
1. User pastes URL → Zustand `download-store.url`
2. Clicks Analyze → `invoke('analyze_url', { url })`
3. Rust spawns `yt-dlp -J --no-download URL`, captures stdout JSON
4. Parses `VideoMeta`, returns to frontend
5. Frontend populates `MetadataCard` (thumbnail loaded as `<img src=thumbnail_url>`)

### Format Discovery Flow
1. User clicks "Show formats" (or auto-triggers after analyze)
2. `invoke('list_formats', { url })`
3. Rust spawns `yt-dlp -F URL`, parses format table text
4. Returns `Vec<FormatInfo>` — frontend shows in `FormatSelector`
5. Format IDs are mapped internally, visible to user as readable descriptions

### Download Lifecycle
1. User selects format, filename, settings → clicks Download
2. Frontend calls `invoke('enqueue_download', { url, format_id, filename, output_dir, ... })`
3. Rust adds `DownloadItem` to queue → worker pops next item
4. Worker spawns `yt-dlp -f FORMAT_ID -o "OUTPUT_DIR/FILENAME.%(ext)s" URL`
5. For download sections: adds `--download-sections "*START-END"`
6. For premiere mode: adds `--merge-output-format mp4 --format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]"`
7. Worker reads stdout line-by-line, emits `download-progress` events
8. On completion, if Premiere Convert enabled: spawns ffmpeg for re-encode
9. Emits `download-complete` event

### Cancel Flow
- Frontend calls `invoke('cancel_download', { id })`
- Rust kills child process via `child.kill()`, removes from queue
- Emits `download-progress` with status="cancelled"

## Sidecar Management

### Initial Setup
- Copy yt-dlp.exe from WinGet source to `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe`
- Copy ffmpeg.exe from WinGet source to `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`
- Configure `externalBin` in `tauri.conf.json`

### Update yt-dlp
- `invoke('update_ytdlp')`
- Rust uses `reqwest` to fetch latest release from GitHub API
- Downloads `yt-dlp.exe` from latest release assets
- Replaces the sidecar binary in the app's resource directory
- On next app start, Tauri picks up the new binary

## UI Design

### Design Language
- Clean, minimal, modern (quality level: Linear, Raycast, Arc)
- shadcn/ui components only
- Light mode first (theme toggle optional)
- Responsive desktop layout (min-width ~800px)

### Main Screen Layout
```
+----------------------------------------------------+
|  YTMate                                    [⚙️]   |
+----------------------------------------------------+
|  +----------------------------------------------+ |
|  |  Paste YouTube URL                    [Analyze]| |
|  +----------------------------------------------+ |
|                                                    |
|  +-------+  Title: ...                             |
|  |       |  Channel: ...                           |
|  | thumb |  Duration: ...                          |
|  |       |  Uploaded: ...                          |
|  +-------+                                         |
|                                                    |
|  Save Location: C:\Users\...\Downloads [Browse]    |
|  Filename: [________________________]              |
|                                                    |
|  [Video+Audio] [Video Only] [Audio Only]           |
|                                                    |
|  ┌─ Format ──────────────────────────────────────┐ |
|  │ ○ 1080p H.264 AAC MP4                    2.1GB│ |
|  │ ○ 1080p VP9 Opus WEBM                   1.8GB│ |
|  │ ○ 720p  H.264 AAC MP4                    800MB│ |
|  │ ○ Audio Only AAC M4A                     50MB │ |
|  └───────────────────────────────────────────────┘ |
|                                                    |
|  ☐ Premiere Compatible (H.264/AAC/MP4)             |
|                                                    |
|  ▶ Advanced (collapsed)                            |
|    Start Time: [00:00]  End Time: [____]           |
|                                                    |
|  [█████████████████████████ Download ██████████]   |
+----------------------------------------------------+
|  Queue                                              |
|  ┌──────────────────────────────────────────────┐  |
|  │ [img] Title                    52.3%  12MB/s │  |
|  │       filename.mp4                    00:42  │  |
|  │       ████████████████░░░░░░░ Downloading  │  |
|  └──────────────────────────────────────────────┘  |
+----------------------------------------------------+
```

### Settings Page
- Default Download Folder — folder picker
- Theme — Light/Dark toggle
- Auto Update yt-dlp — toggle
- Auto Convert for Premiere — toggle
- [Update yt-dlp] button

## Format Parsing

### yt-dlp -J Output
Parse JSON from `--dump-json` or `-J` flag:
- `title`, `duration`, `channel`, `upload_date`, `thumbnail`
- `formats[]` — each has `format_id`, `ext`, `resolution`, `vcodec`, `acodec`, `fps`, `filesize`
- Map to `FormatInfo` struct for frontend display

### yt-dlp -F Output
Parse the table format:
```
ID  EXT   RESOLUTION  FPS  CODECS        FILESIZE
18  mp4   640x360     30   avc1.42001E   45.6MiB
22  mp4   1280x720    30   avc1.64001F  120.3MiB
```
Internal mapping: user selects readable description → ID passed to download command.

### Codec Display Mapping
| yt-dlp codec | Display name |
|-------------|-------------|
| `avc1` | H.264 |
| `vp9` | VP9 |
| `av01` | AV1 |
| `mp4a` | AAC |
| `opus` | Opus |
| `mp3` | MP3 |

## Edge Cases & Error Handling

- **Invalid URL** — show error inline, don't crash
- **Video unavailable** — parse yt-dlp stderr, show message
- **Download interrupted** — emit failed status with error string
- **Queue full** — cap at 10 concurrent items (processed sequentially)
- **Disk full** — catch yt-dlp error, show user-friendly message
- **FFmpeg missing** — graceful degradation (disable MP4 conversion, show warning)
- **Network timeout** — 30s timeout on analyze, show retry button
- **Filename conflicts** — yt-dlp auto-appends (1), (2) etc.
- **App close during download** — warn user via dialog, cancel active processes

## Out of Scope (v1)
- Playlist downloads (single videos only)
- Browser extension integration
- Subtitle downloads
- Thumbnail downloads
- Audio format conversion (beyond MP4)
