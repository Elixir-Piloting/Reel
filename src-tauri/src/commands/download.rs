use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use uuid::Uuid;
use crate::models::*;
use crate::queue::SharedQueue;
use crate::models::progress::parse_progress;

const QUEUE_SCHEMA_VERSION: u32 = 1;

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
            let _ = std::fs::write(&path, json);
        }
    }
}

pub fn load_saved_queue(app: &AppHandle, queue: &SharedQueue) {
    let path = queue_path(app);
    if let Ok(json) = std::fs::read_to_string(&path) {
        let mut items: Option<Vec<DownloadItem>> = None;
        // Try new format (wrapped with version)
        if let Ok(data) = serde_json::from_str::<QueueData>(&json) {
            if data.version == QUEUE_SCHEMA_VERSION {
                items = Some(data.items);
            }
        }
        // Fall back to legacy format (bare array)
        if items.is_none() {
            if let Ok(legacy) = serde_json::from_str::<Vec<DownloadItem>>(&json) {
                items = Some(legacy);
            }
        }
        if let Some(mut loaded) = items {
            // Mark any in-flight items as failed (app was closed)
            for item in loaded.iter_mut() {
                match item.status {
                    DownloadStatus::Queued | DownloadStatus::Downloading => {
                        item.status = DownloadStatus::Failed("App was closed".to_string());
                    }
                    _ => {}
                }
            }
            if let Ok(mut q) = queue.lock() {
                q.items = loaded;
            }
        }
    }
}



pub type ActiveProcesses = Arc<Mutex<std::collections::HashMap<String, tauri_plugin_shell::process::CommandChild>>>;

fn sanitize_filename(s: &str) -> String {
    let invalid = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    s.chars().map(|c| if invalid.contains(&c) { '_' } else { c }).collect()
}

fn emit_progress(app: &AppHandle, id: &str, progress: f64, speed: &str, eta: &str, status: &str) {
    let _ = app.emit("download-progress", serde_json::json!({
        "id": id,
        "progress": progress,
        "speed": speed,
        "eta": eta,
        "status": status,
    }));
}

fn emit_item_update(app: &AppHandle, queue: &SharedQueue, id: &str) {
    let snapshot = queue.lock().unwrap().snapshot();
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
        status: DownloadStatus::Queued,
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
    // Parallelism is inherent: each enqueue spawns its own task; yt-dlp is the bottleneck
    tauri::async_runtime::spawn(async move {
        process_download(app_clone, queue_clone, active_clone, *req, item_id).await;
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

    // Mark as downloading
    {
        let mut q = queue.lock().unwrap();
        q.update(&id, |item| {
            item.status = DownloadStatus::Downloading;
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
    let mut attempt = 0;

    'retry: loop {
        attempt += 1;
        crate::logging::log_info(&format!("[process_download] attempt {}/{}", attempt, max_attempts));

        let mut args: Vec<String> = Vec::new();
        let embed_thumbnail = attempt == 1;

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
                    _ => "mp4",
                };
                args.push("--merge-output-format".to_string());
                args.push(merge_format.to_string());
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
        args.push(format!("{}/{}.%(ext)s", output_dir, safe_filename));
        args.push("--newline".to_string());
        args.push("--progress".to_string());
        args.push("--no-playlist".to_string());
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
                    let msg = format!("Failed to start yt-dlp: {}", e);
                    crate::logging::log_error(&format!("[process_download] ERROR spawning yt-dlp: {}", e));
                    if attempt >= max_attempts {
                        let mut q = queue.lock().unwrap();
                        q.update(&id, |item| {
                            item.status = DownloadStatus::Failed(msg.clone());
                        });
                        emit_progress(&app, &id, 0.0, "", "", &msg);
                    } else {
                        crate::logging::log_info("[process_download] will retry after spawn error");
                    }
                    if attempt >= max_attempts { return; } else { continue 'retry; }
                }
            },
            Err(e) => {
                let msg = format!("Sidecar not found: {}", e);
                crate::logging::log_error(&format!("[process_download] ERROR sidecar not found: {}", e));
                let mut q = queue.lock().unwrap();
                q.update(&id, |item| {
                    item.status = DownloadStatus::Failed(msg.clone());
                });
                emit_progress(&app, &id, 0.0, "", "", &msg);
                return;
            }
        };

        {
            let mut procs = active.lock().unwrap();
            procs.insert(id.clone(), child);
            crate::logging::log_info("[process_download] child process stored for cancellation");
        }

        let mut last_progress: f64 = 0.0;
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
                            let mut q = queue.lock().unwrap();
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
                            let mut q = queue.lock().unwrap();
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
                    {
                        let mut procs = active.lock().unwrap();
                        procs.remove(&id);
                        crate::logging::log_info("[process_download] child removed from active processes");
                    }
                    emit_item_update(&app, &queue, &id);

                    if payload.code == Some(0) {
                        crate::logging::log_info("[process_download] yt-dlp completed successfully");
                        if premiere_mode && download_type == DownloadType::Video {
                            {
                                let mut q = queue.lock().unwrap();
                                q.update(&id, |item| {
                                    item.status = DownloadStatus::Converting;
                                });
                            }
                            emit_progress(&app, &id, 100.0, "", "", "Converting");

                            let input_path = format!("{}/{}.mp4", output_dir, safe_filename);
                            let temp_path = format!("{}/{}_temp.mp4", output_dir, safe_filename);

                            let (mut conv_rx, _conv_child) = match app.shell().sidecar("ffmpeg") {
                                Ok(cmd) => match cmd.args([
                                    "-i", &input_path,
                                    "-c:v", "libx264",
                                    "-pix_fmt", "yuv420p",
                                    "-c:a", "aac",
                                    "-y", &temp_path,
                                ]).spawn() {
                                    Ok(pair) => pair,
                                    Err(_) => {
                                        let _ = emit_item_update(&app, &queue, &id);
                                        break 'retry;
                                    }
                                },
                                Err(_) => { let _ = emit_item_update(&app, &queue, &id); break 'retry; }
                            };

                            while let Some(conv_event) = conv_rx.recv().await {
                                match conv_event {
                                    CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                                        let text = String::from_utf8_lossy(&line);
                                        let _ = crate::models::progress::parse_ffmpeg_progress(&text);
                                    }
                                    CommandEvent::Terminated(conv_status) => {
                                        if conv_status.code == Some(0) {
                                            let _ = std::fs::remove_file(&input_path);
                                            let _ = std::fs::rename(&temp_path, &input_path);
                                        }
                                        break;
                                    }
                                    _ => {}
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
                            let mut q = queue.lock().unwrap();
                            q.update(&id, |item| {
                                item.status = DownloadStatus::Completed;
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
                            if attempt < max_attempts {
                                crate::logging::log_info("[process_download] retrying without --embed-thumbnail/--add-metadata");
                                continue 'retry;
                            }
                            let mut q = queue.lock().unwrap();
                            q.update(&id, |item| {
                                item.status = DownloadStatus::Failed(error.clone());
                            });
                            save_queue(&app, &queue);
                            emit_progress(&app, &id, last_progress, "", "", &format!("Failed: {}", error));
                            crate::logging::log_info("[process_download] DONE (exit)");
                            return;
                        }
                    } else {
                        let error = "yt-dlp was terminated by signal".to_string();
                        crate::logging::log_error("[process_download] process terminated by signal");
                        if attempt < max_attempts {
                            crate::logging::log_info("[process_download] retrying without --embed-thumbnail/--add-metadata");
                            continue 'retry;
                        }
                        let mut q = queue.lock().unwrap();
                        q.update(&id, |item| {
                            item.status = DownloadStatus::Failed(error.clone());
                        });
                        emit_progress(&app, &id, last_progress, "", "", &format!("Failed: {}", error));
                        crate::logging::log_info("[process_download] DONE (exit)");
                        return;
                    }
                }
                _ => {}
            }
        }

        crate::logging::log_info("[process_download] streaming loop ended (rx stream closed)");
        return;
    }
}

#[tauri::command]
pub async fn cancel_download(
    app: AppHandle,
    active: State<'_, ActiveProcesses>,
    queue: State<'_, SharedQueue>,
    id: String,
) -> Result<bool, String> {
    let sq = queue.inner().clone();
    {
        let mut procs = active.lock().map_err(|e| e.to_string())?;
        if let Some(child) = procs.remove(&id) {
            let _ = child.kill();
        }
    }
    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        q.update(&id, |item| {
            item.status = DownloadStatus::Cancelled;
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
    let sq = queue.inner().clone();
    let mut count = 0u32;
    {
        let mut procs = active.lock().map_err(|e| e.to_string())?;
        for (_, child) in procs.drain() {
            let _ = child.kill();
        }
    }
    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        for item in q.items.iter_mut() {
            if item.status == DownloadStatus::Queued || item.status == DownloadStatus::Downloading {
                item.status = DownloadStatus::Cancelled;
                count += 1;
            }
        }
    }
    save_queue(&app, &sq);
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
    };

    enqueue_download(app, queue, active, req).await
}

fn pause_internal(app: &AppHandle, active: &ActiveProcesses, queue: &SharedQueue, id: &str) {
    let sq = queue.clone();
    {
        let mut procs = active.lock().unwrap();
        if let Some(child) = procs.remove(id) {
            let _ = child.kill();
        }
    }
    {
        let mut q = queue.lock().unwrap();
        q.update(id, |item| {
            item.status = DownloadStatus::Paused;
        });
    }
    save_queue(app, &sq);
    emit_progress(app, id, 0.0, "", "", "Paused");
    emit_item_update(app, queue, id);
}

fn resume_internal(app: &AppHandle, queue: &SharedQueue, active: &ActiveProcesses, id: &str) {
    let item = {
        let q = queue.lock().unwrap();
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
            .filter(|i| i.status == DownloadStatus::Downloading)
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
            if item.status == DownloadStatus::Queued {
                item.status = DownloadStatus::Paused;
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
            .filter(|i| i.status == DownloadStatus::Paused)
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
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    let _ = std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open explorer: {}", e))?;
    Ok(())
}
