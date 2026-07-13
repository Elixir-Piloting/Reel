# YTMate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete YouTube downloader desktop app (YTMate) with Tauri v2, React, shadcn/ui, Zustand, bundled yt-dlp and ffmpeg sidecars.

**Architecture:** Hybrid state model — Zustand for UI state, Rust for all process execution and download queue management, Tauri events for streaming progress.

**Tech Stack:** Tauri v2, Rust, React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Zustand, tauri-plugin-shell, tauri-plugin-dialog, tauri-plugin-fs

## Global Constraints
- Tauri v2 API only (no v1 compat)
- All yt-dlp/ffmpeg execution goes through Rust commands — never shell from React
- Sidecar binaries follow Tauri v2 naming: `name-target-triple.exe`
- Light mode first, shadcn/ui components only
- Windows x86_64 target only
- yt-dlp.exe bundled from WinGet (v2026.07.04), ffmpeg.exe from WinGet full build (N-124716)

---

### Task 1: Project Setup — Dependencies, Sidecar Binaries, Config

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Create: `src-tauri/binaries/` (directory)
- Create: (copy) yt-dlp.exe → `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe`
- Create: (copy) ffmpeg.exe → `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`

**Interfaces:**
- Produces: Updated Cargo.toml with plugin deps, tauri.conf.json with externalBin, capabilities with shell/dialog/fs permissions

- [ ] **Step 1: Install frontend dependencies**

```bash
npm install zustand lucide-react class-variance-authority clsx tailwind-merge @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-switch @radix-ui/react-label @radix-ui/react-select @radix-ui/react-progress @radix-ui/react-tooltip tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add Rust plugin dependencies to Cargo.toml**

Edit `src-tauri/Cargo.toml`, add to `[dependencies]`:
```
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
reqwest = { version = "0.12", features = ["blocking"] }
regex = "1"
dirs = "5"
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 3: Copy sidecar binaries**

```powershell
$srcDir = "C:\dev\tauri\ytmate\src-tauri\binaries"
New-Item -ItemType Directory -Path $srcDir -Force

Copy-Item -Path "C:\Users\dog\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\yt-dlp.exe" -Destination "$srcDir\yt-dlp-x86_64-pc-windows-msvc.exe"

Copy-Item -Path "C:\Users\dog\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-N-124716-g054dffd133-win64-gpl\bin\ffmpeg.exe" -Destination "$srcDir\ffmpeg-x86_64-pc-windows-msvc.exe"
```

- [ ] **Step 4: Update tauri.conf.json**

Set `externalBin` in `build` section:
```json
"build": {
  "beforeDevCommand": "npm run dev",
  "devUrl": "http://localhost:1420",
  "beforeBuildCommand": "npm run build",
  "frontendDist": "../dist",
  "externalBin": ["binaries/yt-dlp", "binaries/ffmpeg"]
}
```

Increase window size to 960x720:
```json
"windows": [{
  "title": "YTMate",
  "width": 960,
  "height": 720,
  "minWidth": 800,
  "minHeight": 600
}]
```

- [ ] **Step 5: Update capabilities/default.json**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "shell:default",
    "shell:allow-execute",
    "shell:allow-stdin-write",
    "dialog:default",
    "dialog:allow-open",
    "fs:default",
    "fs:allow-read",
    "fs:allow-exists"
  ]
}
```

- [ ] **Step 6: Update vite.config.ts with Tailwind plugin**

```typescript
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  resolve: {
    alias: { "@": "/src" },
  },
  plugins: [tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
```

- [ ] **Step 7: Add TypeScript path alias to tsconfig.json**

Add to `compilerOptions`:
```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

- [ ] **Step 8: Update index.html title**

```html
<title>YTMate</title>
```

- [ ] **Step 9: Initialize git repo and commit initial state**

```powershell
git init
git add .
git commit -m "chore: initial scaffold from tauri v2 template"
```

- [ ] **Step 10: Verify project builds**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

---

### Task 2: Rust Models and Queue Infrastructure

**Files:**
- Create: `src-tauri/src/models/mod.rs`
- Create: `src-tauri/src/models/progress.rs`
- Create: `src-tauri/src/queue/mod.rs`
- Create: `src-tauri/src/queue/worker.rs`

**Interfaces:**
- Consumes: serde, serde_json, regex crates
- Produces: Shared types used by all commands, DownloadQueue struct with push/pop/cancel

- [ ] **Step 1: Create models/mod.rs**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMeta {
    pub title: String,
    pub duration: f64,
    pub channel: String,
    pub upload_date: String,
    pub thumbnail_url: String,
    pub webpage_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: String,
    pub resolution: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub container: String,
    pub fps: Option<f64>,
    pub filesize: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    pub format_id: String,
    pub filename: String,
    pub output_dir: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub premiere_mode: bool,
    pub download_type: DownloadType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadType {
    VideoAudio,
    VideoOnly,
    AudioOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub title: String,
    pub filename: String,
    pub output_path: String,
    pub progress: f64,
    pub speed: String,
    pub eta: String,
    pub status: DownloadStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Merging,
    Converting,
    Completed,
    Failed(String),
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub default_download_folder: String,
    pub auto_update_ytdlp: bool,
    pub auto_convert_premiere: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_download_folder: dirs::download_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("C:\\Users\\dog\\Downloads"))
                .to_string_lossy()
                .to_string(),
            auto_update_ytdlp: false,
            auto_convert_premiere: false,
        }
    }
}
```

- [ ] **Step 2: Create models/progress.rs**

```rust
use regex::Regex;

pub struct ProgressInfo {
    pub percent: f64,
    pub speed: String,
    pub eta: String,
}

pub fn parse_progress(line: &str) -> Option<ProgressInfo> {
    let re = Regex::new(
        r"\[download\]\s+(\d+\.?\d*)%\s*(?:of\s+~?\s*[\d.]+\w+i?B\s+)?at\s+([\d.]+[KMG]?i?B/s)\s+eta\s+(\S+)"
    ).ok()?;

    if let Some(caps) = re.captures(line) {
        Some(ProgressInfo {
            percent: caps[1].parse().unwrap_or(0.0),
            speed: caps[2].to_string(),
            eta: caps[3].to_string(),
        })
    } else {
        None
    }
}

pub fn parse_ffmpeg_progress(line: &str) -> Option<f64> {
    let re = Regex::new(r"time=(\d+):(\d+):(\d+)\.(\d+)").ok()?;
    if let Some(caps) = re.captures(line) {
        let hours: f64 = caps[1].parse().unwrap_or(0.0);
        let minutes: f64 = caps[2].parse().unwrap_or(0.0);
        let seconds: f64 = caps[3].parse().unwrap_or(0.0);
        Some(hours * 3600.0 + minutes * 60.0 + seconds)
    } else {
        None
    }
}
```

- [ ] **Step 3: Create queue/mod.rs**

```rust
use std::sync::{Arc, Mutex};
use crate::models::DownloadItem;

pub type SharedQueue = Arc<Mutex<DownloadQueue>>;

#[derive(Debug)]
pub struct DownloadQueue {
    pub items: Vec<DownloadItem>,
}

impl DownloadQueue {
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    pub fn push(&mut self, item: DownloadItem) {
        self.items.push(item);
    }

    pub fn remove(&mut self, id: &str) {
        self.items.retain(|i| i.id != id);
    }

    pub fn update(&mut self, id: &str, f: impl FnOnce(&mut DownloadItem)) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            f(item);
        }
    }

    pub fn next_queued(&self) -> Option<usize> {
        self.items.iter().position(|i| i.status == crate::models::DownloadStatus::Queued)
    }

    pub fn get(&self, id: &str) -> Option<&DownloadItem> {
        self.items.iter().find(|i| i.id == id)
    }

    pub fn snapshot(&self) -> Vec<DownloadItem> {
        self.items.clone()
    }
}
```

- [ ] **Step 4: Create queue/worker.rs**

```rust
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::thread;
use tauri::AppHandle;
use tauri::Emitter;
use crate::models::*;
use crate::queue::SharedQueue;

pub struct DownloadWorker {
    running: Arc<AtomicBool>,
    queue: SharedQueue,
    handle: Option<thread::JoinHandle<()>>,
}

impl DownloadWorker {
    pub fn new(queue: SharedQueue) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            queue,
            handle: None,
        }
    }

    pub fn start(&mut self, app: AppHandle) {
        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        let queue = self.queue.clone();

        self.handle = Some(thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                let next_id = {
                    let mut q = queue.lock().unwrap();
                    q.next_queued().map(|idx| q.items[idx].id.clone())
                };

                if let Some(id) = next_id {
                    // Update status to Downloading
                    {
                        let mut q = queue.lock().unwrap();
                        q.update(&id, |item| item.status = DownloadStatus::Downloading);
                    }
                    emit_progress(&app, &id, 0.0, "", "", &DownloadStatus::Downloading);

                    // Clone the item data we need
                    let item = {
                        let q = queue.lock().unwrap();
                        q.get(&id).cloned()
                    };

                    if let Some(item) = item {
                        // Build yt-dlp args
                        let args = build_ytdlp_args(&item);
                        // Spawn and stream...
                        // (placeholder for the actual process spawning - will be completed in Task 4)
                        let _ = args;
                    }
                } else {
                    thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }));
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

fn emit_progress(app: &AppHandle, id: &str, percent: f64, speed: &str, eta: &str, status: &DownloadStatus) {
    let _ = app.emit("download-progress", serde_json::json!({
        "id": id,
        "percent": percent,
        "speed": speed,
        "eta": eta,
        "status": serde_json::to_value(status).unwrap_or_default(),
    }));
}

fn build_ytdlp_args(item: &DownloadItem) -> Vec<String> {
    let mut args = vec![
        "-f".to_string(),
        item.url.clone(), // format_id and URL need proper mapping
        "-o".to_string(),
        format!("{}/{}.%(ext)s", item.output_path, item.filename),
        "--newline".to_string(),
        "--progress".to_string(),
    ];
    args
}
```

---

### Task 3: Rust Analyze & Formats Commands

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/analyze.rs`
- Create: `src-tauri/src/commands/formats.rs`

**Interfaces:**
- Consumes: models (VideoMeta, FormatInfo), tauri-plugin-shell
- Produces: `analyze_url` command, `list_formats` command

- [ ] **Step 1: Create commands/mod.rs**

```rust
pub mod analyze;
pub mod formats;
pub mod download;
pub mod settings;
pub mod browse;
pub mod update;
```

- [ ] **Step 2: Create commands/analyze.rs**

```rust
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use crate::models::VideoMeta;

#[tauri::command]
pub async fn analyze_url(app: AppHandle, url: String) -> Result<VideoMeta, String> {
    let sidecar = app.shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    let output = sidecar
        .args(["-J", "--no-download", "--no-playlist", &url])
        .output()
        .await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse yt-dlp output: {}", e))?;

    let title = json["title"].as_str().unwrap_or("Unknown").to_string();
    let duration = json["duration"].as_f64().unwrap_or(0.0);
    let channel = json["channel"].as_str()
        .or_else(|| json["uploader"].as_str())
        .unwrap_or("Unknown")
        .to_string();
    let upload_date = json["upload_date"].as_str().unwrap_or("").to_string();
    let thumbnail_url = json["thumbnail"].as_str().unwrap_or("").to_string();
    let webpage_url = json["webpage_url"].as_str().unwrap_or(&url).to_string();

    Ok(VideoMeta {
        title,
        duration,
        channel,
        upload_date,
        thumbnail_url,
        webpage_url,
    })
}
```

- [ ] **Step 3: Create commands/formats.rs**

```rust
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use crate::models::FormatInfo;

fn codec_display_name(codec: &str) -> String {
    match codec {
        "avc1" | "h264" => "H.264".to_string(),
        "vp9" => "VP9".to_string(),
        "av01" | "av1" => "AV1".to_string(),
        "mp4a" => "AAC".to_string(),
        "opus" => "Opus".to_string(),
        "mp3" => "MP3".to_string(),
        "none" => "None".to_string(),
        _ => codec.to_uppercase(),
    }
}

fn determine_container(ext: &str, video_codec: &str, audio_codec: &str) -> String {
    if ext == "mp4" || video_codec.contains("h264") || video_codec.contains("avc") {
        "MP4".to_string()
    } else if ext == "webm" || video_codec == "vp9" || video_codec == "av01" {
        "WEBM".to_string()
    } else if ext == "m4a" {
        "M4A".to_string()
    } else if ext == "3gp" {
        "3GP".to_string()
    } else {
        ext.to_uppercase()
    }
}

#[tauri::command]
pub async fn list_formats(app: AppHandle, url: String) -> Result<Vec<FormatInfo>, String> {
    let sidecar = app.shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    let output = sidecar
        .args(["-J", "--no-download", "--no-playlist", &url])
        .output()
        .await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse yt-dlp output: {}", e))?;

    let formats = json["formats"].as_array()
        .ok_or("No formats found")?;

    let mut result: Vec<FormatInfo> = Vec::new();

    for fmt in formats {
        let format_id = fmt["format_id"].as_str().unwrap_or("").to_string();
        let ext = fmt["ext"].as_str().unwrap_or("").to_string();
        let vcodec = fmt["vcodec"].as_str().unwrap_or("none");
        let acodec = fmt["acodec"].as_str().unwrap_or("none");

        // Skip formats with no video and no audio (data formats)
        if vcodec == "none" && acodec == "none" {
            continue;
        }

        let resolution = fmt["resolution"].as_str()
            .or_else(|| fmt["format_note"].as_str())
            .unwrap_or("")
            .to_string();

        let height = fmt["height"].as_u64().unwrap_or(0);
        if resolution.is_empty() && height > 0 {
            let width = fmt["width"].as_u64().unwrap_or(0);
            let resolution_str = if width > 0 {
                format!("{}p", height)
            } else {
                format!("{}p", height)
            };
            result.push(FormatInfo {
                format_id,
                ext: ext.clone(),
                resolution: resolution_str,
                video_codec: codec_display_name(vcodec),
                audio_codec: codec_display_name(acodec),
                container: determine_container(&ext, vcodec, acodec),
                fps: fmt["fps"].as_f64(),
                filesize: fmt["filesize"].as_u64().or_else(|| fmt["filesize_approx"].as_u64()),
            });
        } else {
            result.push(FormatInfo {
                format_id,
                ext: ext.clone(),
                resolution: if resolution.is_empty() {
                    if acodec != "none" && vcodec == "none" {
                        "Audio only".to_string()
                    } else {
                        "Unknown".to_string()
                    }
                } else {
                    resolution
                },
                video_codec: codec_display_name(vcodec),
                audio_codec: codec_display_name(acodec),
                container: determine_container(&ext, vcodec, acodec),
                fps: fmt["fps"].as_f64(),
                filesize: fmt["filesize"].as_u64().or_else(|| fmt["filesize_approx"].as_u64()),
            });
        }
    }

    Ok(result)
}
```

---

### Task 4: Rust Download Queue & Worker (Full)

**Files:**
- Create: `src-tauri/src/commands/download.rs`
- Modify: `src-tauri/src/queue/worker.rs`

**Interfaces:**
- Consumes: models, queue, tauri-plugin-shell
- Produces: `enqueue_download`, `cancel_download`, `get_queue` commands; full worker with process streaming

- [ ] **Step 1: Create commands/download.rs**

```rust
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;
use crate::models::*;
use crate::queue::SharedQueue;
use crate::models::progress::parse_progress;

struct ActiveProcess {
    child_pid: u32,
}

pub struct ActiveProcesses {
    pub processes: std::sync::Mutex<std::collections::HashMap<String, ActiveProcess>>,
}

impl ActiveProcesses {
    pub fn new() -> Self {
        Self {
            processes: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
}

#[tauri::command]
pub async fn enqueue_download(
    app: AppHandle,
    queue: State<'_, SharedQueue>,
    request: DownloadRequest,
) -> Result<DownloadItem, String> {
    let id = Uuid::new_v4().to_string();

    let item = DownloadItem {
        id: id.clone(),
        url: request.url.clone(),
        title: request.filename.clone(),
        filename: request.filename.clone(),
        output_path: request.output_dir.clone(),
        progress: 0.0,
        speed: String::new(),
        eta: String::new(),
        status: DownloadStatus::Queued,
    };

    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        q.push(item.clone());
    }

    // Spawn the worker thread
    let app_clone = app.clone();
    let queue_clone = queue.inner().clone();
    let req = request.clone();
    let item_id = id.clone();

    tauri::async_runtime::spawn(async move {
        process_download(app_clone, queue_clone, req, item_id).await;
    });

    Ok(item)
}

async fn process_download(app: AppHandle, queue: SharedQueue, request: DownloadRequest, id: String) {
    // Update to Downloading
    {
        let mut q = queue.lock().unwrap();
        q.update(&id, |item| {
            item.status = DownloadStatus::Downloading;
        });
    }

    let _ = app.emit("download-progress", serde_json::json!({
        "id": id, "percent": 0, "speed": "", "eta": "", "status": "Downloading"
    }));

    // Build args
    let mut args: Vec<String> = Vec::new();

    // Format selection based on download type
    let format_arg = match request.download_type {
        DownloadType::VideoAudio => {
            if request.premiere_mode {
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]".to_string()
            } else {
                "bestvideo+bestaudio/best".to_string()
            }
        }
        DownloadType::VideoOnly => {
            if request.premiere_mode {
                "bestvideo[ext=mp4]".to_string()
            } else {
                "bestvideo".to_string()
            }
        }
        DownloadType::AudioOnly => {
            "bestaudio/best".to_string()
        }
    };

    args.push("-f".to_string());
    args.push(format_arg);
    args.push("-o".to_string());
    args.push(format!("{}/{}.%(ext)s", request.output_dir, request.filename));
    args.push("--newline".to_string());
    args.push("--progress".to_string());
    args.push("--no-playlist".to_string());

    // Download sections
    if let Some(start) = &request.start_time {
        if !start.is_empty() {
            let section = if let Some(end) = &request.end_time {
                if !end.is_empty() {
                    format!("*{}-{}", start, end)
                } else {
                    format!("*{}-", start)
                }
            } else {
                format!("*{}-", start)
            };
            args.push("--download-sections".to_string());
            args.push(section);
        }
    }

    // Embed thumbnail for audio
    if request.download_type == DownloadType::AudioOnly {
        args.push("--embed-thumbnail".to_string());
        args.push("--add-metadata".to_string());
    }

    args.push(&request.url);

    // Wait a tiny bit for UI to register
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Execute via sidecar
    let result = app.shell()
        .sidecar("yt-dlp")
        .unwrap()
        .args(&args)
        .output()
        .await;

    match result {
        Ok(output) => {
            if output.status.success() {
                // Check if we need ffmpeg conversion
                if request.premiere_mode && request.download_type != DownloadType::AudioOnly {
                    // Do ffmpeg conversion
                    let input_path = format!("{}/{}.mp4", request.output_dir, request.filename);
                    let output_path = format!("{}/{}_premiere.mp4", request.output_dir, request.filename);

                    {
                        let mut q = queue.lock().unwrap();
                        q.update(&id, |item| {
                            item.status = DownloadStatus::Converting;
                        });
                    }

                    let _ = app.emit("download-progress", serde_json::json!({
                        "id": id, "percent": 100, "speed": "", "eta": "", "status": "Converting"
                    }));

                    let convert_result = app.shell()
                        .sidecar("ffmpeg")
                        .unwrap()
                        .args([
                            "-i", &input_path,
                            "-c:v", "libx264",
                            "-pix_fmt", "yuv420p",
                            "-c:a", "aac",
                            "-y", &output_path,
                        ])
                        .output()
                        .await;

                    if convert_result.is_ok() {
                        let _ = std::fs::remove_file(&input_path);
                        let _ = std::fs::rename(&output_path, &input_path);
                    }
                }

                {
                    let mut q = queue.lock().unwrap();
                    q.update(&id, |item| {
                        item.status = DownloadStatus::Completed;
                        item.progress = 100.0;
                    });
                }

                let _ = app.emit("download-progress", serde_json::json!({
                    "id": id, "percent": 100, "speed": "", "eta": "", "status": "Completed"
                }));
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                {
                    let mut q = queue.lock().unwrap();
                    q.update(&id, |item| {
                        item.status = DownloadStatus::Failed(stderr.to_string());
                    });
                }
                let _ = app.emit("download-progress", serde_json::json!({
                    "id": id, "percent": 0, "speed": "", "eta": "", "status": format!("Failed: {}", stderr)
                }));
            }
        }
        Err(e) => {
            {
                let mut q = queue.lock().unwrap();
                q.update(&id, |item| {
                    item.status = DownloadStatus::Failed(e.to_string());
                });
            }
            let _ = app.emit("download-progress", serde_json::json!({
                "id": id, "percent": 0, "speed": "", "eta": "", "status": format!("Failed: {}", e)
            }));
        }
    }
}

#[tauri::command]
pub async fn cancel_download(
    app: AppHandle,
    queue: State<'_, SharedQueue>,
    id: String,
) -> Result<bool, String> {
    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        q.update(&id, |item| {
            item.status = DownloadStatus::Cancelled;
        });
    }

    let _ = app.emit("download-progress", serde_json::json!({
        "id": id, "percent": 0, "speed": "", "eta": "", "status": "Cancelled"
    }));

    Ok(true)
}

#[tauri::command]
pub async fn get_queue(queue: State<'_, SharedQueue>) -> Result<Vec<DownloadItem>, String> {
    let q = queue.lock().map_err(|e| e.to_string())?;
    Ok(q.snapshot())
}
```

- [ ] **Step 2: Complete worker.rs with proper streaming**

Replace the placeholder in `worker.rs` with actual streaming logic (or keep the current architecture where downloads are spawned in `commands/download.rs` and the worker manages the queue). The simpler approach is to have each download spawn its own async task (as in the commands/download.rs above) and the worker just manages queue state.

---

### Task 5: Rust Settings, Browse, Update Commands

**Files:**
- Create: `src-tauri/src/commands/settings.rs`
- Create: `src-tauri/src/commands/browse.rs`
- Create: `src-tauri/src/commands/update.rs`

**Interfaces:**
- Produces: `get_settings`, `save_settings`, `browse_folder`, `update_ytdlp` commands

- [ ] **Step 1: Create commands/settings.rs**

```rust
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;
use crate::models::AppSettings;

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    std::fs::create_dir_all(&dir).ok();
    dir.join("settings.json")
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    let path = settings_path(&app);
    if let Ok(data) = std::fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppSettings::default()
    }
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app);
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 2: Create commands/browse.rs**

```rust
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn browse_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app.dialog()
        .file()
        .pick_folder();

    match file.await {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}
```

- [ ] **Step 3: Create commands/update.rs**

```rust
use tauri::AppHandle;

#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    // Download latest yt-dlp.exe from GitHub
    let response = reqwest::get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Get the sidecar binary path
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let target_path = resource_dir.join("binaries").join("yt-dlp-x86_64-pc-windows-msvc.exe");

    std::fs::write(&target_path, &bytes)
        .map_err(|e| format!("Failed to write: {}", e))?;

    Ok(format!("Updated to {} bytes", bytes.len()))
}
```

---

### Task 6: Frontend Foundation — Stores, Utils, shadcn Setup

**Files:**
- Create: `src/main.tsx`
- Modify: `src/styles.css`
- Create: `src/lib/utils.ts`
- Create: `src/lib/tauri.ts`
- Create: `src/stores/download-store.ts`
- Create: `src/stores/queue-store.ts`
- Create: `src/stores/settings-store.ts`

**Interfaces:**
- Produces: Zustand stores consumed by all UI components, typed invoke wrappers, cn() utility

- [ ] **Step 1: Replace src/styles.css with Tailwind**

```css
@import "tailwindcss";

@plugin "tailwindcss-animate";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0.042 265.755);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.965 0.001 286.375);
  --secondary-foreground: oklch(0.205 0.042 265.755);
  --muted: oklch(0.965 0.001 286.375);
  --muted-foreground: oklch(0.556 0.009 286.375);
  --accent: oklch(0.965 0.001 286.375);
  --accent-foreground: oklch(0.205 0.042 265.755);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0.004 286.375);
  --input: oklch(0.922 0.004 286.375);
  --ring: oklch(0.205 0.042 265.755);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0.042 265.755);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0.042 265.755);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0.004 286.375);
  --primary-foreground: oklch(0.205 0.042 265.755);
  --secondary: oklch(0.269 0.017 286.375);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0.017 286.375);
  --muted-foreground: oklch(0.708 0.01 286.375);
  --accent: oklch(0.269 0.017 286.375);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.269 0.017 286.375);
  --input: oklch(0.269 0.017 286.375);
  --ring: oklch(0.439 0.012 286.375);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: "Inter", system-ui, sans-serif;
  }
}
```

- [ ] **Step 2: Create src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Create src/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return dateStr;
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 4: Create src/lib/tauri.ts**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface VideoMeta {
  title: string;
  duration: number;
  channel: string;
  upload_date: string;
  thumbnail_url: string;
  webpage_url: string;
}

export interface FormatInfo {
  format_id: string;
  ext: string;
  resolution: string;
  video_codec: string;
  audio_codec: string;
  container: string;
  fps: number | null;
  filesize: number | null;
}

export interface DownloadRequest {
  url: string;
  format_id: string;
  filename: string;
  output_dir: string;
  start_time: string | null;
  end_time: string | null;
  premiere_mode: boolean;
  download_type: "VideoAudio" | "VideoOnly" | "AudioOnly";
}

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  filename: string;
  output_path: string;
  progress: number;
  speed: string;
  eta: string;
  status: string;
}

export interface AppSettings {
  default_download_folder: string;
  auto_update_ytdlp: boolean;
  auto_convert_premiere: boolean;
}

export async function analyzeUrl(url: string): Promise<VideoMeta> {
  return invoke("analyze_url", { url });
}

export async function listFormats(url: string): Promise<FormatInfo[]> {
  return invoke("list_formats", { url });
}

export async function enqueueDownload(request: DownloadRequest): Promise<DownloadItem> {
  return invoke("enqueue_download", { request });
}

export async function cancelDownload(id: string): Promise<boolean> {
  return invoke("cancel_download", { id });
}

export async function getQueue(): Promise<DownloadItem[]> {
  return invoke("get_queue");
}

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function browseFolder(): Promise<string | null> {
  return invoke("browse_folder");
}

export async function updateYtdlp(): Promise<string> {
  return invoke("update_ytdlp");
}

export function onDownloadProgress(callback: (data: DownloadItem) => void) {
  return listen<DownloadItem>("download-progress", (event) => {
    callback(event.payload);
  });
}
```

- [ ] **Step 5: Create src/stores/download-store.ts**

```typescript
import { create } from "zustand";
import type { VideoMeta, FormatInfo, DownloadRequest } from "../lib/tauri";

interface DownloadStore {
  url: string;
  metadata: VideoMeta | null;
  formats: FormatInfo[];
  selectedFormatId: string | null;
  filename: string;
  outputDir: string;
  downloadType: "VideoAudio" | "VideoOnly" | "AudioOnly";
  premiereMode: boolean;
  startTime: string;
  endTime: string;
  isAnalyzing: boolean;
  isFetchingFormats: boolean;
  error: string | null;

  setUrl: (url: string) => void;
  setMetadata: (meta: VideoMeta | null) => void;
  setFormats: (formats: FormatInfo[]) => void;
  setSelectedFormatId: (id: string | null) => void;
  setFilename: (name: string) => void;
  setOutputDir: (dir: string) => void;
  setDownloadType: (type: "VideoAudio" | "VideoOnly" | "AudioOnly") => void;
  setPremiereMode: (mode: boolean) => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  setIsAnalyzing: (v: boolean) => void;
  setIsFetchingFormats: (v: boolean) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

const initialState = {
  url: "",
  metadata: null,
  formats: [],
  selectedFormatId: null,
  filename: "",
  outputDir: "",
  downloadType: "VideoAudio" as const,
  premiereMode: false,
  startTime: "",
  endTime: "",
  isAnalyzing: false,
  isFetchingFormats: false,
  error: null,
};

export const useDownloadStore = create<DownloadStore>((set) => ({
  ...initialState,
  setUrl: (url) => set({ url }),
  setMetadata: (meta) => set({ metadata: meta, filename: meta?.title ?? "" }),
  setFormats: (formats) => set({ formats }),
  setSelectedFormatId: (id) => set({ selectedFormatId: id }),
  setFilename: (name) => set({ filename: name }),
  setOutputDir: (dir) => set({ outputDir: dir }),
  setDownloadType: (type) => set({ downloadType: type }),
  setPremiereMode: (mode) => set({ premiereMode: mode }),
  setStartTime: (time) => set({ startTime: time }),
  setEndTime: (time) => set({ endTime: time }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setIsFetchingFormats: (v) => set({ isFetchingFormats: v }),
  setError: (err) => set({ error: err }),
  reset: () => set(initialState),
}));
```

- [ ] **Step 6: Create src/stores/queue-store.ts**

```typescript
import { create } from "zustand";
import type { DownloadItem } from "../lib/tauri";
import { getQueue, onDownloadProgress } from "../lib/tauri";

interface QueueStore {
  items: DownloadItem[];
  loadQueue: () => Promise<void>;
  updateItem: (item: DownloadItem) => void;
  initListener: () => () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],

  loadQueue: async () => {
    try {
      const items = await getQueue();
      set({ items });
    } catch {
      // ignore
    }
  },

  updateItem: (item: DownloadItem) => {
    set((state) => {
      const existing = state.items.findIndex((i) => i.id === item.id);
      if (existing >= 0) {
        const updated = [...state.items];
        updated[existing] = item;
        return { items: updated };
      }
      return { items: [...state.items, item] };
    });
  },

  initListener: () => {
    const unlisten = onDownloadProgress((item) => {
      get().updateItem(item);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  },
}));
```

- [ ] **Step 7: Create src/stores/settings-store.ts**

```typescript
import { create } from "zustand";
import type { AppSettings } from "../lib/tauri";
import { getSettings, saveSettings } from "../lib/tauri";

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {
    default_download_folder: "",
    auto_update_ytdlp: false,
    auto_convert_premiere: false,
  },
  loaded: false,

  loadSettings: async () => {
    try {
      const settings = await getSettings();
      set({ settings, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    await saveSettings(updated);
    set({ settings: updated });
  },
}));
```

- [ ] **Step 8: Create shadcn UI primitives**

Create the following shadcn components at `src/components/ui/`:
- `button.tsx`
- `input.tsx`
- `card.tsx`
- `tabs.tsx`
- `progress.tsx`
- `switch.tsx`
- `label.tsx`
- `select.tsx`
- `dialog.tsx`

These follow the standard shadcn/ui patterns. Copy from the shadcn registry with appropriate styling.

---

### Task 7: Frontend Download Components

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/progress.tsx`
- Create: `src/components/ui/switch.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/download/UrlInput.tsx`
- Create: `src/components/download/MetadataCard.tsx`
- Create: `src/components/download/FormatSelector.tsx`
- Create: `src/components/download/DownloadTypeTabs.tsx`
- Create: `src/components/download/PremiereToggle.tsx`
- Create: `src/components/download/DownloadButton.tsx`
- Create: `src/components/download/AdvancedSection.tsx`

**Interfaces:**
- Consumes: download-store, tauri wrappers
- Produces: All download-related UI components

- [ ] **Step 1: Create shadcn button component**

Create `src/components/ui/button.tsx` with standard shadcn button pattern (variants: default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon).

- [ ] **Step 2: Create shadcn input component**

Create `src/components/ui/input.tsx` with standard shadcn input.

- [ ] **Step 3: Create shadcn card component**

Create `src/components/ui/card.tsx` with Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter.

- [ ] **Step 4: Create shadcn tabs component**

Create `src/components/ui/tabs.tsx` using @radix-ui/react-tabs.

- [ ] **Step 5: Create shadcn progress component**

Create `src/components/ui/progress.tsx` using @radix-ui/react-progress.

- [ ] **Step 6: Create shadcn switch component**

Create `src/components/ui/switch.tsx` using @radix-ui/react-switch.

- [ ] **Step 7: Create shadcn label component**

Create `src/components/ui/label.tsx` using @radix-ui/react-label.

- [ ] **Step 8: Create shadcn select component**

Create `src/components/ui/select.tsx` using @radix-ui/react-select.

- [ ] **Step 9: Create UrlInput.tsx**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDownloadStore } from "@/stores/download-store";
import { analyzeUrl as analyzeUrlApi, listFormats } from "@/lib/tauri";

export function UrlInput() {
  const { url, setUrl, setMetadata, setFormats, setSelectedFormatId, setIsAnalyzing, setIsFetchingFormats, setError } = useDownloadStore();
  const [isAnalyzing, setIsAnalyzingLocal] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzingLocal(true);
    setError(null);
    try {
      const meta = await analyzeUrlApi(url.trim());
      setMetadata(meta);
      setIsAnalyzing(true);
      // Fetch formats in parallel
      setIsFetchingFormats(true);
      const formats = await listFormats(url.trim());
      setFormats(formats);
      if (formats.length > 0) {
        setSelectedFormatId(formats[0].format_id);
      }
    } catch (err: any) {
      setError(typeof err === "string" ? err : "Failed to analyze URL");
    } finally {
      setIsAnalyzingLocal(false);
      setIsAnalyzing(false);
      setIsFetchingFormats(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Paste YouTube URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
        className="flex-1"
      />
      <Button onClick={handleAnalyze} disabled={isAnalyzing || !url.trim()}>
        {isAnalyzing ? "Analyzing..." : "Analyze"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 10: Create MetadataCard.tsx**

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDownloadStore } from "@/stores/download-store";
import { formatDuration, formatDate } from "@/lib/utils";

export function MetadataCard() {
  const { metadata, error } = useDownloadStore();
  const [imgLoaded, setImgLoaded] = useState(false);

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!metadata) return null;

  return (
    <Card>
      <CardContent className="p-4 flex gap-4">
        <div className="relative w-40 h-24 shrink-0 rounded-md overflow-hidden bg-muted">
          {metadata.thumbnail_url && (
            <img
              src={metadata.thumbnail_url}
              alt={metadata.title}
              className={`w-full h-full object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
            />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="font-semibold text-base leading-tight truncate">{metadata.title}</h2>
          <p className="text-sm text-muted-foreground">{metadata.channel}</p>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{formatDuration(metadata.duration)}</span>
            <span>{formatDate(metadata.upload_date)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 11: Create FormatSelector.tsx**

```tsx
import { useDownloadStore } from "@/stores/download-store";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function FormatSelector() {
  const { formats, selectedFormatId, setSelectedFormatId, premiereMode } = useDownloadStore();

  if (formats.length === 0) return null;

  const filtered = premiereMode
    ? formats.filter((f) => f.container === "MP4" && f.video_codec === "H.264")
    : formats;

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Format</p>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {filtered.map((fmt) => (
          <button
            key={fmt.format_id}
            onClick={() => setSelectedFormatId(fmt.format_id)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md text-sm border transition-colors",
              selectedFormatId === fmt.format_id
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted"
            )}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{fmt.resolution}</span>
              <span className="text-muted-foreground text-xs">
                {fmt.filesize ? formatBytes(fmt.filesize) : "Unknown size"}
              </span>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{fmt.video_codec}</span>
              <span>{fmt.audio_codec}</span>
              <span>{fmt.container}</span>
              {fmt.fps && fmt.fps > 30 && <span>{fmt.fps}fps</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Create DownloadTypeTabs.tsx**

```tsx
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDownloadStore } from "@/stores/download-store";

export function DownloadTypeTabs() {
  const { downloadType, setDownloadType } = useDownloadStore();

  return (
    <Tabs value={downloadType} onValueChange={(v) => setDownloadType(v as any)}>
      <TabsList className="w-full">
        <TabsTrigger value="VideoAudio" className="flex-1">Video + Audio</TabsTrigger>
        <TabsTrigger value="VideoOnly" className="flex-1">Video Only</TabsTrigger>
        <TabsTrigger value="AudioOnly" className="flex-1">Audio Only</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

- [ ] **Step 13: Create PremiereToggle.tsx**

```tsx
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDownloadStore } from "@/stores/download-store";

export function PremiereToggle() {
  const { premiereMode, setPremiereMode } = useDownloadStore();

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="premiere-mode"
        checked={premiereMode}
        onCheckedChange={setPremiereMode}
      />
      <Label htmlFor="premiere-mode" className="text-sm cursor-pointer">
        Premiere Compatible
      </Label>
    </div>
  );
}
```

- [ ] **Step 14: Create AdvancedSection.tsx**

```tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDownloadStore } from "@/stores/download-store";
import { cn } from "@/lib/utils";

export function AdvancedSection() {
  const [open, setOpen] = useState(false);
  const { startTime, endTime, setStartTime, setEndTime } = useDownloadStore();

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? "▼" : "▶"} Advanced
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="start-time" className="text-xs">Start Time</Label>
            <Input
              id="start-time"
              placeholder="00:00"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end-time" className="text-xs">End Time</Label>
            <Input
              id="end-time"
              placeholder="02:20"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 15: Create DownloadButton.tsx**

```tsx
import { Button } from "@/components/ui/button";
import { useDownloadStore } from "@/stores/download-store";
import { useSettingsStore } from "@/stores/settings-store";
import { enqueueDownload, browseFolder } from "@/lib/tauri";
import { useState } from "react";

export function DownloadButton() {
  const {
    url, filename, outputDir, selectedFormatId,
    downloadType, premiereMode, startTime, endTime, metadata,
    setOutputDir, setError,
  } = useDownloadStore();
  const { settings } = useSettingsStore();
  const [downloading, setDownloading] = useState(false);

  const handleBrowse = async () => {
    const dir = await browseFolder();
    if (dir) setOutputDir(dir);
  };

  const handleDownload = async () => {
    if (!url || !selectedFormatId) return;
    const dir = outputDir || settings.default_download_folder;
    if (!dir) {
      setError("Please select a download folder");
      return;
    }
    setDownloading(true);
    try {
      await enqueueDownload({
        url,
        format_id: selectedFormatId,
        filename: filename || metadata?.title || "video",
        output_dir: dir,
        start_time: startTime || null,
        end_time: endTime || null,
        premiere_mode: premiereMode,
        download_type: downloadType,
      });
    } catch (err: any) {
      setError(typeof err === "string" ? err : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">Save Location</Label>
        <div className="flex gap-2">
          <Input
            value={outputDir || settings.default_download_folder}
            readOnly
            className="flex-1 text-sm h-9"
            placeholder="Select download folder..."
          />
          <Button variant="outline" onClick={handleBrowse} className="h-9 whitespace-nowrap">
            Browse
          </Button>
        </div>
      </div>
      <Button onClick={handleDownload} disabled={downloading || !url} size="lg" className="h-9">
        {downloading ? "Adding..." : "Download"}
      </Button>
    </div>
  );
}
```

---

### Task 8: Frontend Queue Components

**Files:**
- Create: `src/components/queue/DownloadQueue.tsx`
- Create: `src/components/queue/DownloadItem.tsx`

**Interfaces:**
- Consumes: queue-store, utils
- Produces: Download queue UI with live progress

- [ ] **Step 1: Create DownloadItem.tsx**

```tsx
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { DownloadItem as DownloadItemType } from "@/lib/tauri";
import { cancelDownload } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface Props {
  item: DownloadItemType;
}

const statusColors: Record<string, string> = {
  Queued: "text-muted-foreground",
  Downloading: "text-blue-500",
  Merging: "text-amber-500",
  Converting: "text-amber-500",
  Completed: "text-green-500",
  Failed: "text-destructive",
  Cancelled: "text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  Queued: "Queued",
  Downloading: "Downloading",
  Merging: "Merging...",
  Converting: "Converting...",
  Completed: "Completed",
  Failed: "Failed",
  Cancelled: "Cancelled",
};

export function DownloadItemRow({ item }: Props) {
  const isActive = item.status === "Downloading" || item.status === "Merging" || item.status === "Converting";
  const isFinished = item.status === "Completed" || item.status === "Failed" || item.status === "Cancelled";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex justify-between items-start">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <span className={cn("text-xs shrink-0 ml-2", statusColors[item.status] || "")}>
            {item.status === "Failed"
              ? "Failed"
              : statusLabels[item.status] || item.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
        {(item.status === "Downloading" || item.status === "Merging" || item.status === "Converting") && (
          <div className="space-y-1">
            <Progress value={item.progress} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{item.progress.toFixed(1)}%</span>
              <span>{item.speed}</span>
              <span>{item.eta}</span>
            </div>
          </div>
        )}
        {item.status === "Completed" && <Progress value={100} className="h-1.5" />}
      </div>
      {!isFinished && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => cancelDownload(item.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create DownloadQueue.tsx**

```tsx
import { useEffect } from "react";
import { useQueueStore } from "@/stores/queue-store";
import { DownloadItemRow } from "./DownloadItem";

export function DownloadQueue() {
  const { items, loadQueue, initListener } = useQueueStore();

  useEffect(() => {
    loadQueue();
    const cleanup = initListener();
    return () => cleanup();
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Queue</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <DownloadItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
```

---

### Task 9: Frontend Settings Page

**Files:**
- Create: `src/components/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: settings-store, tauri wrappers
- Produces: Settings UI

- [ ] **Step 1: Create SettingsPage.tsx**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSettingsStore } from "@/stores/settings-store";
import { browseFolder, updateYtdlp } from "@/lib/tauri";

export function SettingsPage() {
  const { settings, loadSettings, updateSettings } = useSettingsStore();
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const handleBrowseDefault = async () => {
    const dir = await browseFolder();
    if (dir) {
      await updateSettings({ default_download_folder: dir });
    }
  };

  const handleUpdateYtdlp = async () => {
    setUpdating(true);
    setUpdateMsg("");
    try {
      const msg = await updateYtdlp();
      setUpdateMsg(msg);
    } catch (err: any) {
      setUpdateMsg(typeof err === "string" ? err : "Update failed");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Default Download Folder</Label>
            <div className="flex gap-2">
              <Input
                value={settings.default_download_folder}
                readOnly
                className="flex-1"
              />
              <Button variant="outline" onClick={handleBrowseDefault}>
                Browse
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="auto-update" className="cursor-pointer">Auto Update yt-dlp</Label>
            <Switch
              id="auto-update"
              checked={settings.auto_update_ytdlp}
              onCheckedChange={(v) => updateSettings({ auto_update_ytdlp: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="auto-convert" className="cursor-pointer">Auto Convert for Premiere</Label>
            <Switch
              id="auto-convert"
              checked={settings.auto_convert_premiere}
              onCheckedChange={(v) => updateSettings({ auto_convert_premiere: v })}
            />
          </div>

          <div className="pt-2 border-t space-y-2">
            <Button onClick={handleUpdateYtdlp} disabled={updating} variant="secondary">
              {updating ? "Updating..." : "Update yt-dlp"}
            </Button>
            {updateMsg && (
              <p className="text-xs text-muted-foreground">{updateMsg}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### Task 10: App Shell & Integration

**Files:**
- Create: `src/App.tsx`
- Create: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Create AppShell.tsx**

```tsx
import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 h-12 flex items-center justify-between">
        <h1 className="font-semibold text-sm">YTMate</h1>
      </header>
      <main className="p-6 max-w-3xl mx-auto space-y-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create App.tsx**

```tsx
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { UrlInput } from "@/components/download/UrlInput";
import { MetadataCard } from "@/components/download/MetadataCard";
import { FormatSelector } from "@/components/download/FormatSelector";
import { DownloadTypeTabs } from "@/components/download/DownloadTypeTabs";
import { PremiereToggle } from "@/components/download/PremiereToggle";
import { AdvancedSection } from "@/components/download/AdvancedSection";
import { DownloadButton } from "@/components/download/DownloadButton";
import { DownloadQueue } from "@/components/queue/DownloadQueue";
import { useSettingsStore } from "@/stores/settings-store";

export default function App() {
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <AppShell>
      <div className="space-y-4">
        <UrlInput />
        <MetadataCard />
        <DownloadButton />
        <DownloadTypeTabs />
        <FormatSelector />
        <PremiereToggle />
        <AdvancedSection />
        <DownloadQueue />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
cargo build --manifest-path src-tauri/Cargo.toml
```

---

### Task 11: Wire Rust Commands into lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update lib.rs to register all plugins and commands**

```rust
mod commands;
mod models;
mod queue;

use std::sync::{Arc, Mutex};
use queue::SharedQueue;
use commands::download::ActiveProcesses;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let queue: SharedQueue = Arc::new(Mutex::new(queue::DownloadQueue::new()));
    let active_processes = Arc::new(ActiveProcesses::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(queue)
        .manage(active_processes)
        .invoke_handler(tauri::generate_handler![
            commands::analyze::analyze_url,
            commands::formats::list_formats,
            commands::download::enqueue_download,
            commands::download::cancel_download,
            commands::download::get_queue,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::browse::browse_folder,
            commands::update::update_ytdlp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Final build verification**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
npm run build
```
