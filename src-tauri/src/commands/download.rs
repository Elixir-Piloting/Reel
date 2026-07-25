use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use futures::FutureExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::process::CommandEvent;
use uuid::Uuid;
use scopeguard::defer;
use crate::models::*;
use crate::queue::SharedQueue;
use crate::models::progress::parse_progress;

const QUEUE_SCHEMA_VERSION: u32 = 1;
static CANCELLATION_TOKEN: AtomicBool = AtomicBool::new(false);

fn lock_mutex<T>(m: &Arc<Mutex<T>>) -> MutexGuard<'_, T> {
    match m.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            crate::logging::log_info("[mutex] Mutex poisoned, recovering inner data");
            poisoned.into_inner()
        }
    }
}

fn download_semaphore() -> &'static Arc<tokio::sync::Semaphore> {
    static SEM: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
    SEM.get_or_init(|| Arc::new(tokio::sync::Semaphore::new(3)))
}

#[derive(Serialize, Deserialize)]
struct QueueData {
    version: u32,
    items: Vec<DownloadItem>,
}

fn queue_path(app: &AppHandle) -> std::path::PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_default();
    dir.join("queue.json")
}

fn save_queue(app: &AppHandle, queue: &SharedQueue) {
    let path = queue_path(app);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(q) = queue.lock() {
        let data = QueueData {
            version: QUEUE_SCHEMA_VERSION,
            items: q.items.clone(),
        };
        if let Ok(json) = serde_json::to_string(&data) {
            let tmp_path = path.with_extension("json.tmp");
            if std::fs::write(&tmp_path, &json).is_ok() {
                let _ = std::fs::rename(&tmp_path, &path);
            }
        }
    }
}

pub fn load_saved_queue(app: &AppHandle, queue: &SharedQueue) {
    let path = queue_path(app);
    // Recover from .tmp if main file is missing
    if !path.exists() {
        let tmp = path.with_extension("json.tmp");
        if tmp.exists() {
            crate::logging::log_info("[load_saved_queue] Recovering from queue.json.tmp");
            let _ = std::fs::rename(&tmp, &path);
        }
    }
    let json = match std::fs::read_to_string(&path) {
        Ok(d) => d,
        Err(_) => return,
    };

    let parsed: serde_json::Value = match serde_json::from_str(&json) {
        Ok(v) => v,
        Err(e) => {
            crate::logging::log_info(&format!("[load_saved_queue] Failed to parse queue.json, starting fresh: {}", e));
            return;
        }
    };

    let version = parsed["version"].as_u64().unwrap_or(0) as u32;
    let loaded = if version != QUEUE_SCHEMA_VERSION {
        crate::logging::log_info(&format!(
            "[load_saved_queue] Queue schema version mismatch: file={}, current={}. Attempting migration...",
            version, QUEUE_SCHEMA_VERSION
        ));
        if let Ok(items) = serde_json::from_value::<Vec<DownloadItem>>(parsed["items"].clone()) {
            crate::logging::log_info(&format!("[load_saved_queue] Queue parsed with {} items despite version mismatch", items.len()));
            Some(items)
        } else {
            crate::logging::log_info("[load_saved_queue] Failed to migrate queue — starting fresh");
            None
        }
    } else {
        // Try new format (wrapped with version)
        serde_json::from_value::<QueueData>(parsed.clone())
            .ok()
            .map(|d| d.items)
            // Fall back to legacy format (bare array)
            .or_else(|| serde_json::from_value(parsed).ok())
    };

    if let Some(mut items) = loaded {
        for item in items.iter_mut() {
            match item.status.as_str() {
                "Queued" | "Downloading" => {
                    item.status = "Failed".to_string();
                    item.error = Some("App was closed".to_string());
                }
                _ => {}
            }
        }
        if let Ok(mut q) = queue.lock() {
            q.items = items;
        }
    }
}



pub struct DownloadHandle {
    pub child: CommandChild,
    pub cancelled: Arc<AtomicBool>,
}

pub type ActiveProcesses = Arc<Mutex<HashMap<String, DownloadHandle>>>;

struct ProcessGuard {
    child: Option<CommandChild>,
}

impl Drop for ProcessGuard {
    fn drop(&mut self) {
        if let Some(child) = self.child.take() {
            let _ = child.kill();
        }
    }
}

fn sanitize_filename(name: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    let name = name.nfc().collect::<String>();
    let mut sanitized: Vec<char> = Vec::with_capacity(name.len());
    for c in name.chars() {
        match c {
            '\0' | '\x01'..='\x1F' => continue,
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => {
                sanitized.push('_');
            }
            _ => sanitized.push(c),
        }
    }
    let mut result: String = sanitized.iter().collect();
    while result.contains("__") {
        result = result.replace("__", "_");
    }
    while result.starts_with('.') || result.starts_with("..") {
        result = result.trim_start_matches('.').trim_start_matches("..").to_string();
    }
    if result.len() > 200 {
        let mut boundary = 200;
        while !result.is_char_boundary(boundary) {
            boundary -= 1;
        }
        result.truncate(boundary);
    }
    result
}

fn encoding_to_ext<'a>(encoding: &'a str, download_type: &DownloadType) -> &'a str {
    match encoding {
        "mkv" => "mkv",
        "webm" => "webm",
        "m4a" => "m4a",
        "opus" => "opus",
        "flac" => "flac",
        "wav" => "wav",
        "mp4_h264" | "mp4_h265" => "mp4",
        _ => if *download_type == DownloadType::Audio { "mp3" } else { "mp4" },
    }
}

fn emit_progress(app: &AppHandle, id: &str, progress: f64, speed: &str, eta: &str, status: &str) {
    let progress = progress.clamp(0.0, 100.0);
    let _ = app.emit("download-progress", serde_json::json!({
        "id": id,
        "progress": progress,
        "speed": speed,
        "eta": eta,
        "status": status,
    }));
}

fn emit_item_update(app: &AppHandle, queue: &SharedQueue, id: &str) {
    let snapshot = lock_mutex(queue).snapshot();
    if let Some(item) = snapshot.into_iter().find(|i| i.id == id) {
        let _ = app.emit("download-item-update", serde_json::to_value(&item).unwrap_or_default());
    }
}

#[tauri::command]
pub async fn enqueue_download(
    app: AppHandle,
    queue: State<'_, SharedQueue>,
    active: State<'_, ActiveProcesses>,
    request: DownloadRequest,
) -> Result<DownloadItem, String> {
    crate::logging::log_info(&format!("[enqueue_download] INVOKED"));
    crate::logging::log_info(&format!("[enqueue_download] url={:?} format_id={:?} download_type={:?} output_dir={:?}",
        request.url, request.format_id, request.download_type, request.output_dir));
    crate::logging::log_info(&format!("[enqueue_download] filename={:?} premiere_mode={:?} has_audio={:?}",
        request.filename, request.premiere_mode, request.has_audio));

    let output_path = std::path::Path::new(&request.output_dir);
    if !output_path.is_absolute() {
        return Err("Output directory must be an absolute path".into());
    }

    let id = Uuid::new_v4().to_string();
    crate::logging::log_info(&format!("[enqueue_download] generated id={}", id));

    let safe_name = sanitize_filename(&request.filename);
    let ext = match request.encoding.as_str() {
        "mkv" => "mkv",
        "webm" => "webm",
        "m4a" => "m4a",
        "opus" => "opus",
        "flac" => "flac",
        "wav" => "wav",
        "mp4_h264" | "mp4_h265" => "mp4",
        _ => if request.download_type == DownloadType::Audio { "mp3" } else { "mp4" },
    };

    let resolved_filename = crate::models::resolve_filename_conflict(&request.output_dir, &safe_name, &ext);
    let resolved_base = resolved_filename.strip_suffix(&format!(".{}", ext)).unwrap_or(&safe_name).to_string();

    let dt_str = format!("{:?}", request.download_type);
    let item = DownloadItem {
        id: id.clone(),
        url: request.url.clone(),
        title: sanitize_filename(&request.video_title),
        filename: resolved_filename.clone(),
        output_path: request.output_dir.clone(),
        progress: 0.0,
        speed: String::new(),
        eta: String::new(),
        status: "Queued".to_string(),
        error: None,
        channel: request.channel.clone(),
        duration: request.duration,
        thumbnail_url: request.thumbnail_url.clone(),
        ext: ext.to_string(),
        format_id: request.format_id.clone(),
        download_type: dt_str,
        has_audio: request.has_audio,
    };
    crate::logging::log_info(&format!("[enqueue_download] item created {:?}", item.id));

    let sq = queue.inner().clone();
    {
        let mut q = queue.lock().map_err(|e| { crate::logging::log_error(&format!("[enqueue_download] lock error: {}", e)); e.to_string() })?;
        q.push(item.clone());
        crate::logging::log_info(&format!("[enqueue_download] item pushed to queue ({} items)", q.items.len()));
    }
    save_queue(&app, &sq);
    emit_item_update(&app, queue.inner(), &id);
    crate::logging::log_info("[enqueue_download] item-update event emitted");

    let app_clone = app.clone();
    let queue_clone = queue.inner().clone();
    let active_clone = active.inner().clone();
    let mut req = Box::new(request);
    req.filename = resolved_base;
    let item_id = id.clone();

    crate::logging::log_info("[enqueue_download] spawning process_download task...");
    tauri::async_runtime::spawn(async move {
        if CANCELLATION_TOKEN.load(Ordering::SeqCst) {
            return;
        }
        let should_abort = queue_clone.lock()
            .map(|q| q.items.iter().any(|i| i.id == item_id && i.status == "Cancelled"))
            .unwrap_or(false);
        if should_abort {
            return;
        }

        // Acquire semaphore permit to limit concurrent downloads
        let _permit = match download_semaphore().clone().acquire_owned().await {
            Ok(p) => p,
            Err(e) => {
                crate::logging::log_error(&format!("[enqueue_download] Semaphore error: {}", e));
                return;
            }
        };

        let app_for_process = app_clone.clone();
        let result = std::panic::AssertUnwindSafe(
            process_download(app_for_process, queue_clone.clone(), active_clone.clone(), *req, item_id.clone())
        ).catch_unwind().await;

        match result {
            Ok(_) => {}
            Err(panic_payload) => {
                let msg = format!("Download panicked: {:?}", panic_payload);
                crate::logging::log_error(&msg);
                if let Ok(mut q) = queue_clone.lock() {
                    q.update(&item_id, |item| {
                        item.status = "Failed".to_string();
                        item.error = Some("Internal error".to_string());
                    });
                }
                save_queue(&app_clone, &queue_clone);
                let _ = app_clone.emit("download-item-update", serde_json::json!({
                    "id": item_id, "status": "Failed", "error": "Internal error"
                }));
            }
        }
    });
    crate::logging::log_info("[enqueue_download] returning Ok(item)");

    Ok(item)
}

pub(crate) async fn process_download(
    app: AppHandle,
    queue: SharedQueue,
    active: ActiveProcesses,
    request: DownloadRequest,
    id: String,
) {
    crate::logging::log_info(&format!("[process_download] STARTED for id={}", id));
    crate::logging::log_info(&format!("[process_download] url={:?} format_id={:?} download_type={:?} output_dir={:?}",
        request.url, request.format_id, request.download_type, request.output_dir));

    // Ensure output directory exists and is writable
    let output_dir_path = Path::new(&request.output_dir);
    if !output_dir_path.exists() {
        if let Err(e) = std::fs::create_dir_all(output_dir_path) {
            crate::logging::log_error(&format!("[process_download] Failed to create output dir: {}", e));
            let mut q = lock_mutex(&queue);
            q.update(&id, |item| { item.status = "Failed".to_string(); item.error = Some(format!("Failed to create output dir: {}", e)); });
            drop(q);
            save_queue(&app, &queue);
            emit_progress(&app, &id, 0.0, "", "", &format!("Failed: {}", e));
            return;
        }
    }
    let test_file = output_dir_path.join(".ytmate_write_test");
    match std::fs::write(&test_file, b"") {
        Ok(_) => { let _ = std::fs::remove_file(&test_file); }
        Err(e) => {
            crate::logging::log_error(&format!("[process_download] Output dir not writable: {}", e));
            let mut q = lock_mutex(&queue);
            q.update(&id, |item| { item.status = "Failed".to_string(); item.error = Some(format!("Output dir not writable: {}", e)); });
            drop(q);
            save_queue(&app, &queue);
            emit_progress(&app, &id, 0.0, "", "", &format!("Failed: {}", e));
            return;
        }
    }

    // Mark as downloading
    {
        let mut q = lock_mutex(&queue);
        q.update(&id, |item| {
            item.status = "Downloading".to_string();
        });
    }
    save_queue(&app, &queue);
    crate::logging::log_info("[process_download] status set to Downloading");
    emit_progress(&app, &id, 0.0, "", "", "Downloading");
    crate::logging::log_info("[process_download] progress event emitted (0.0)");

    let output_dir = request.output_dir.clone();
    let premiere_mode = request.premiere_mode;
    let download_type = request.download_type.clone();

    let max_attempts = 2;
    let mut last_progress: f64 = 0.0;

    'retry: for attempt in 0..max_attempts {
        if attempt > 0 {
            let delay = Duration::from_secs(2u64.pow(attempt as u32));
            emit_progress(&app, &id, last_progress, "", "", "Retrying (no thumbnail)");
            tokio::time::sleep(delay).await;
        }
        crate::logging::log_info(&format!("[process_download] attempt {}/{}", attempt + 1, max_attempts));

        let mut args: Vec<String> = Vec::new();
        let embed_thumbnail = attempt == 0;

        match download_type {
            DownloadType::Video => {
                let fmt = if request.has_audio {
                    request.format_id.clone()
                } else {
                    format!("{}+bestaudio", request.format_id)
                };
                args.push("-f".to_string());
                args.push(fmt);

                let merge_format = match request.encoding.as_str() {
                    "mkv" => "mkv",
                    "webm" => "webm",
                    "mp4_h264" | "mp4_h265" => "mp4",
                    _ => "mp4",
                };
                args.push("--merge-output-format".to_string());
                args.push(merge_format.to_string());
                if request.encoding == "mp4_h265" {
                    args.push("--postprocessor-args".to_string());
                    args.push("ffmpeg:-c:v libx265 -pix_fmt yuv420p".to_string());
                }
            }
            DownloadType::Audio => {
                args.push("-f".to_string());
                if request.premiere_mode {
                    args.push(format!("{}[ext=m4a]", request.format_id));
                } else {
                    args.push(request.format_id.clone());
                }
                args.push("--extract-audio".to_string());

                let audio_format = match request.encoding.as_str() {
                    "m4a" => "aac",
                    "opus" => "opus",
                    "flac" => "flac",
                    "wav" => "wav",
                    "mp4_h264" | "mp4_h265" => "mp3",
                    _ => "mp3",
                };
                args.push("--audio-format".to_string());
                args.push(audio_format.to_string());
                if embed_thumbnail {
                    args.push("--embed-thumbnail".to_string());
                    args.push("--add-metadata".to_string());
                }
            }
        }

        let safe_filename = sanitize_filename(&request.filename);
        args.push("-o".to_string());
        let output_template = if let Some(ref pattern) = request.filename_pattern {
            if !pattern.is_empty() {
                format!("{}/{}", output_dir, pattern)
            } else {
                format!("{}/{}.%(ext)s", output_dir, safe_filename)
            }
        } else {
            format!("{}/{}.%(ext)s", output_dir, safe_filename)
        };
        args.push(output_template);
        args.push("--newline".to_string());
        args.push("--progress".to_string());
        args.push("--no-playlist".to_string());
        if request.continue_mode {
            args.push("--continue".to_string());
        }
        args.push("--no-part".to_string());
        args.push("--no-mtime".to_string());

        if let Some(ref start) = request.start_time {
            if !start.is_empty() {
                let section = if let Some(ref end) = request.end_time {
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

        let url = request.url.clone();
        args.push(url);

        crate::logging::log_info(&format!("[process_download] Spawning yt-dlp sidecar with {} args", args.len()));
        for (i, arg) in args.iter().enumerate() {
            crate::logging::log_info(&format!("[process_download]   arg[{}] = {:?}", i, arg));
        }

        // Check available disk space roughly
        if let Ok(_meta) = std::fs::metadata(&output_dir) {
            // Basic check: disk has space (we don't know file size in advance)
        }

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

        let mut guard = ProcessGuard { child: Some(child) };

        {
            let mut procs = lock_mutex(&active);
            procs.insert(id.clone(), DownloadHandle {
                child: guard.child.take().unwrap(),
                cancelled: Arc::new(AtomicBool::new(false)),
            });
            crate::logging::log_info("[process_download] child process stored for cancellation");
        }

        let mut error_lines: Vec<String> = Vec::new();
        let mut line_count = 0u64;
        let mut last_emit_time = Instant::now();
        let mut last_emit_pct = 0.0;

        crate::logging::log_info("[process_download] entering streaming loop...");

        while let Some(event) = rx.recv().await {
            line_count += 1;
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if line_count <= 3 {
                        crate::logging::log_info(&format!("[process_download] stdout[{}] = {:?}", line_count, text));
                    }
                    if let Some(info) = parse_progress(&text) {
                        last_progress = info.percent;
                        {
                            let mut q = lock_mutex(&queue);
                            q.update(&id, |item| {
                                item.progress = info.percent;
                                item.speed = info.speed.clone();
                                item.eta = info.eta.clone();
                            });
                        }
                        let now = Instant::now();
                        let should_emit = now.duration_since(last_emit_time).as_millis() >= 100 || (info.percent - last_emit_pct).abs() >= 1.0;
                        if should_emit {
                            emit_progress(&app, &id, info.percent, &info.speed, &info.eta, "Downloading");
                            last_emit_time = now;
                            last_emit_pct = info.percent;
                        }
                        emit_item_update(&app, &queue, &id);
                    }
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if line_count <= 5 {
                        crate::logging::log_info(&format!("[process_download] stderr[{}] = {:?}", line_count, text));
                    }
                    if let Some(info) = parse_progress(&text) {
                        last_progress = info.percent;
                        {
                            let mut q = lock_mutex(&queue);
                            q.update(&id, |item| {
                                item.progress = info.percent;
                                item.speed = info.speed.clone();
                                item.eta = info.eta.clone();
                            });
                        }
                        let now = Instant::now();
                        let should_emit = now.duration_since(last_emit_time).as_millis() >= 100 || (info.percent - last_emit_pct).abs() >= 1.0;
                        if should_emit {
                            emit_progress(&app, &id, info.percent, &info.speed, &info.eta, "Downloading");
                            last_emit_time = now;
                            last_emit_pct = info.percent;
                        }
                        emit_item_update(&app, &queue, &id);
                    } else {
                        let trimmed = text.trim().to_string();
                        if !trimmed.is_empty() {
                            error_lines.push(trimmed);
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    crate::logging::log_info(&format!("[process_download] Terminated event: code={:?} signal={:?}", payload.code, payload.signal));
                    // Check if cancelled by user
                    {
                        let procs = lock_mutex(&active);
                        if let Some(handle) = procs.get(&id) {
                            if handle.cancelled.load(Ordering::SeqCst) {
                                crate::logging::log_info("[process_download] was cancelled, ignoring Terminated event");
                                return;
                            }
                        }
                    }
                    {
                        let mut procs = lock_mutex(&active);
                        procs.remove(&id);
                        crate::logging::log_info("[process_download] child removed from active processes");
                    }
                    emit_item_update(&app, &queue, &id);

                    if payload.code == Some(0) {
                        crate::logging::log_info("[process_download] yt-dlp completed successfully");
                        emit_progress(&app, &id, 100.0, "", "", "Processing");
                        if premiere_mode && download_type == DownloadType::Video {
                            {
                                let mut q = lock_mutex(&queue);
                                q.update(&id, |item| {
                                    item.status = "Converting".to_string();
                                });
                            }
                            emit_progress(&app, &id, 100.0, "", "", "Converting");

                            let input_ext = encoding_to_ext(&request.encoding, &download_type);
                            let input_path = format!("{}/{}.{}", output_dir, safe_filename, input_ext);
                            let temp_path = format!("{}/{}_temp.{}", output_dir, safe_filename, input_ext);
                            let total_duration = request.duration;

                            {
                                let temp_path_clone = temp_path.clone();
                                defer! {
                                    let _ = std::fs::remove_file(&temp_path_clone);
                                }

                                let (mut conv_rx, _conv_child) = match app.shell().sidecar("ffmpeg") {
                                    Ok(cmd) => match cmd.args([
                                        "-i", &input_path,
                                        "-c:v", "libx264",
                                        "-pix_fmt", "yuv420p",
                                        "-c:a", "aac",
                                        "-y", &temp_path,
                                    ]).spawn() {
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
                                    },
                                    Err(e) => {
                                        emit_item_update(&app, &queue, &id);
                                        lock_mutex(&queue).update(&id, |item| {
                                            item.status = "Failed".to_string();
                                            item.error = Some(format!("FFmpeg sidecar error: {}", e));
                                        });
                                        save_queue(&app, &queue);
                                        emit_progress(&app, &id, 0.0, "", "", &format!("Failed: FFmpeg error: {}", e));
                                        return;
                                    }
                                };

                                while let Some(conv_event) = conv_rx.recv().await {
                                    match conv_event {
                                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                                            let text = String::from_utf8_lossy(&line);
                                            if let Some(elapsed) = crate::models::progress::parse_ffmpeg_progress(&text) {
                                                let pct = if total_duration > 0.0 {
                                                    (elapsed / total_duration * 100.0).clamp(0.0, 100.0)
                                                } else {
                                                    0.0
                                                };
                                                emit_progress(&app, &id, pct, "", "", "Converting");
                                            }
                                        }
                                        CommandEvent::Terminated(conv_status) => {
                                                if conv_status.code == Some(0) {
                                                    match std::fs::rename(&temp_path, &input_path) {
                                                        Ok(_) => {
                                                            let _ = std::fs::remove_file(&input_path);
                                                        }
                                                        Err(e) => {
                                                            crate::logging::log_error(&format!("Failed to rename converted file: {}", e));
                                                            let _ = std::fs::remove_file(&temp_path);
                                                        }
                                                    }
                                                }
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }

                        // Post-download verification
                        let ext = match request.encoding.as_str() {
                            "mkv" => "mkv",
                            "webm" => "webm",
                            "m4a" => "m4a",
                            "opus" => "opus",
                            "flac" => "flac",
                            "wav" => "wav",
                            "mp4_h264" | "mp4_h265" => "mp4",
                            _ => if request.download_type == DownloadType::Audio { "mp3" } else { "mp4" },
                        };
                        let output_file = format!("{}/{}.{}", output_dir, safe_filename, ext);
                        let path = Path::new(&output_file);
                        if !path.exists() {
                            crate::logging::log_error(&format!("[process_download] Output file not found: {}", output_file));
                        } else if let Ok(m) = path.metadata() {
                            if m.len() == 0 {
                                crate::logging::log_error(&format!("[process_download] Output file is empty: {}", output_file));
                            } else {
                                crate::logging::log_info(&format!("[process_download] Output file OK: {} ({} bytes)", output_file, m.len()));
                            }
                        }

                        {
                            let mut q = lock_mutex(&queue);
                            q.update(&id, |item| {
                                item.status = "Completed".to_string();
                                item.progress = 100.0;
                            });
                        }
                        save_queue(&app, &queue);
                        crate::logging::log_info("[process_download] status set to Completed");
                        emit_progress(&app, &id, 100.0, "", "", "Completed");
                        emit_item_update(&app, &queue, &id);
                        crate::logging::log_info("[process_download] DONE (success)");
                        return;
                    } else if let Some(code) = payload.code {
                        if code == -1 {
                            crate::logging::log_info("[process_download] process cancelled (code -1)");
                            emit_progress(&app, &id, last_progress, "", "", "Cancelled");
                            return;
                        } else {
                            let detail = error_lines.join(" | ");
                            let error = if detail.is_empty() {
                                format!("yt-dlp failed (code {})", code)
                            } else {
                                format!("{} (code {})", detail, code)
                            };
                            crate::logging::log_error(&format!("[process_download] process failed: {}", error));
                            crate::logging::log_info("[process_download] retrying without --embed-thumbnail/--add-metadata");
                            continue 'retry;
                        }
                    } else {
                        crate::logging::log_error("[process_download] process terminated by signal");
                        crate::logging::log_info("[process_download] retrying without --embed-thumbnail/--add-metadata");
                        continue 'retry;
                    }
                }
                _ => {}
            }
        }

        crate::logging::log_info("[process_download] streaming loop ended (rx stream closed)");
    }

    // All retry attempts exhausted without success
    let mut q = lock_mutex(&queue);
    let already_cancelled = q.items.iter().any(|i| i.id == id && i.status == "Cancelled");
    if already_cancelled {
        return;
    }
    q.update(&id, |item| {
        item.status = "Failed".to_string();
        item.error = Some("All download attempts failed".to_string());
    });
    save_queue(&app, &queue);
    emit_progress(&app, &id, 0.0, "", "", "Failed: All download attempts failed");
    emit_item_update(&app, &queue, &id);
    crate::logging::log_info("[process_download] DONE (all retries exhausted)");
}

#[tauri::command]
pub async fn cancel_download(
    app: AppHandle,
    active: State<'_, ActiveProcesses>,
    queue: State<'_, SharedQueue>,
    id: String,
) -> Result<bool, String> {
    let sq = queue.inner().clone();
    // 1. Kill process if running
    if let Ok(mut procs) = active.lock() {
        if let Some(handle) = procs.remove(&id) {
            handle.cancelled.store(true, Ordering::SeqCst);
            let _ = handle.child.kill();
        }
    }
    // 2. Set status in queue
    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        q.update(&id, |item| {
            item.status = "Cancelled".to_string();
            item.error = None;
        });
    }
    save_queue(&app, &sq);
    emit_progress(&app, &id, 0.0, "", "", "Cancelled");
    emit_item_update(&app, queue.inner(), &id);
    Ok(true)
}

#[tauri::command]
pub async fn get_queue(queue: State<'_, SharedQueue>) -> Result<Vec<DownloadItem>, String> {
    let q = queue.lock().map_err(|e| e.to_string())?;
    Ok(q.snapshot())
}

#[tauri::command]
pub async fn remove_from_queue(
    app: AppHandle,
    queue: State<'_, SharedQueue>,
    id: String,
) -> Result<bool, String> {
    let sq = queue.inner().clone();
    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        q.remove(&id);
    }
    save_queue(&app, &sq);
    Ok(true)
}

#[tauri::command]
pub async fn cancel_all_downloads(
    app: AppHandle,
    active: State<'_, ActiveProcesses>,
    queue: State<'_, SharedQueue>,
) -> Result<u32, String> {
    CANCELLATION_TOKEN.store(true, Ordering::SeqCst);

    let sq = queue.inner().clone();
    let mut count = 0u32;
    {
        let mut procs = active.lock().map_err(|e| e.to_string())?;
        for (_, handle) in procs.drain() {
            handle.cancelled.store(true, Ordering::SeqCst);
            let _ = handle.child.kill();
        }
    }
    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        for item in q.items.iter_mut() {
            match item.status.as_str() {
                "Queued" | "Downloading" => {
                    item.status = "Cancelled".to_string();
                    item.error = None;
                    count += 1;
                }
                _ => {}
            }
        }
    }
    save_queue(&app, &sq);

    // Reset after brief delay for in-flight spawns
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        CANCELLATION_TOKEN.store(false, Ordering::SeqCst);
    });

    Ok(count)
}

#[tauri::command]
pub async fn retry_download(
    app: AppHandle,
    queue: State<'_, SharedQueue>,
    active: State<'_, ActiveProcesses>,
    id: String,
) -> Result<DownloadItem, String> {
    let existing = {
        let q = queue.lock().map_err(|e| e.to_string())?;
        q.get(&id).cloned()
    };
    let item = existing.ok_or_else(|| "Download item not found".to_string())?;

    let req = DownloadRequest {
        url: item.url.clone(),
        format_id: item.format_id.clone(),
        filename: item.title.clone(),
        output_dir: item.output_path.clone(),
        start_time: None,
        end_time: None,
        premiere_mode: false,
        download_type: if item.download_type == "Audio" { DownloadType::Audio } else { DownloadType::Video },
        video_title: item.title.clone(),
        channel: item.channel.clone(),
        duration: item.duration,
        thumbnail_url: item.thumbnail_url.clone(),
        has_audio: item.has_audio,
        encoding: item.ext.clone(),
        filename_pattern: None,
        continue_mode: false,
    };

    enqueue_download(app, queue, active, req).await
}

fn pause_internal(app: &AppHandle, active: &ActiveProcesses, queue: &SharedQueue, id: &str) {
    let sq = queue.clone();
    {
        let mut procs = lock_mutex(active);
        if let Some(handle) = procs.remove(id) {
            let _ = handle.child.kill();
        }
    }
    {
        let mut q = lock_mutex(queue);
        q.update(id, |item| {
            item.status = "Paused".to_string();
        });
    }
    save_queue(app, &sq);
    emit_progress(app, id, 0.0, "", "", "Paused");
    emit_item_update(app, queue, id);
}

fn resume_internal(app: &AppHandle, queue: &SharedQueue, active: &ActiveProcesses, id: &str) {
    let item = {
        let q = lock_mutex(queue);
        q.get(id).cloned()
    };
    if let Some(item) = item {
        let id = id.to_string();
        let req = DownloadRequest {
            url: item.url.clone(),
            format_id: item.format_id.clone(),
            filename: item.title.clone(),
            output_dir: item.output_path.clone(),
            start_time: None,
            end_time: None,
            premiere_mode: false,
            download_type: if item.download_type == "Audio" { DownloadType::Audio } else { DownloadType::Video },
            video_title: item.title.clone(),
            channel: item.channel.clone(),
            duration: item.duration,
            thumbnail_url: item.thumbnail_url.clone(),
            has_audio: item.has_audio,
            encoding: item.ext.clone(),
            filename_pattern: None,
            continue_mode: true,
        };
        let app = app.clone();
        let q = queue.clone();
        let a = active.clone();
        tauri::async_runtime::spawn(async move {
            process_download(app, q, a, req, id).await;
        });
    }
}

#[tauri::command]
pub async fn pause_download(
    app: AppHandle,
    active: State<'_, ActiveProcesses>,
    queue: State<'_, SharedQueue>,
    id: String,
) -> Result<bool, String> {
    pause_internal(&app, active.inner(), queue.inner(), &id);
    Ok(true)
}

#[tauri::command]
pub async fn resume_download(
    app: AppHandle,
    queue: State<'_, SharedQueue>,
    active: State<'_, ActiveProcesses>,
    id: String,
) -> Result<bool, String> {
    resume_internal(&app, queue.inner(), active.inner(), &id);
    Ok(true)
}

#[tauri::command]
pub async fn pause_all_downloads(
    app: AppHandle,
    active: State<'_, ActiveProcesses>,
    queue: State<'_, SharedQueue>,
) -> Result<u32, String> {
    let ids: Vec<String> = {
        let q = queue.lock().map_err(|e| e.to_string())?;
        q.items.iter()
            .filter(|i| i.status == "Downloading")
            .map(|i| i.id.clone())
            .collect()
    };
    for id in &ids {
        pause_internal(&app, active.inner(), queue.inner(), id);
    }
    let count_paused = {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        let mut c = 0u32;
        for item in q.items.iter_mut() {
            if item.status == "Queued" {
                item.status = "Paused".to_string();
                c += 1;
            }
        }
        c + ids.len() as u32
    };
    save_queue(&app, queue.inner());
    Ok(count_paused)
}

#[tauri::command]
pub async fn resume_all_downloads(
    app: AppHandle,
    queue: State<'_, SharedQueue>,
    active: State<'_, ActiveProcesses>,
) -> Result<u32, String> {
    let ids: Vec<String> = {
        let q = queue.lock().map_err(|e| e.to_string())?;
        q.items.iter()
            .filter(|i| i.status == "Paused")
            .map(|i| i.id.clone())
            .collect()
    };
    let count = ids.len() as u32;
    for id in &ids {
        resume_internal(&app, queue.inner(), active.inner(), id);
    }
    Ok(count)
}

#[tauri::command]
pub fn verify_output_dir(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    let _ = std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open explorer: {}", e))?;
    Ok(())
}
