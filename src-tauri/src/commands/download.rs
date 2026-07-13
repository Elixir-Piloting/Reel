use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;
use crate::models::*;
use crate::queue::SharedQueue;

pub struct ActiveProcesses {
    pub processes: Mutex<std::collections::HashMap<String, tauri_plugin_shell::process::CommandChild>>,
}

impl ActiveProcesses {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(std::collections::HashMap::new()),
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

    let app_clone = app.clone();
    let queue_clone = queue.inner().clone();
    let req = Box::new(request.clone());
    let item_id = id.clone();

    tauri::async_runtime::spawn(async move {
        process_download(app_clone, queue_clone, *req, item_id).await;
    });

    Ok(item)
}

async fn process_download(app: AppHandle, queue: SharedQueue, request: DownloadRequest, id: String) {
    {
        let mut q = queue.lock().unwrap();
        q.update(&id, |item| {
            item.status = DownloadStatus::Downloading;
        });
    }

    let _ = app.emit("download-progress", serde_json::json!({
        "id": id, "percent": 0, "speed": "", "eta": "", "status": "Downloading"
    }));

    let mut args: Vec<String> = Vec::new();

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

    if request.download_type == DownloadType::AudioOnly {
        args.push("--embed-thumbnail".to_string());
        args.push("--add-metadata".to_string());
    }

    let output_dir = request.output_dir.clone();
    let output_filename = request.filename.clone();
    let premiere_mode = request.premiere_mode;
    let download_type = request.download_type;

    args.push(request.url);

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let result = app.shell()
        .sidecar("yt-dlp")
        .unwrap()
        .args(&args)
        .output()
        .await;

    match result {
        Ok(output) => {
            if output.status.success() {
                if premiere_mode && download_type != DownloadType::AudioOnly {
                    {
                        let mut q = queue.lock().unwrap();
                        q.update(&id, |item| {
                            item.status = DownloadStatus::Converting;
                        });
                    }

                    let _ = app.emit("download-progress", serde_json::json!({
                        "id": id, "percent": 100, "speed": "", "eta": "", "status": "Converting"
                    }));

                    let input_path = format!("{}/{}.mp4", output_dir, output_filename);
                    let temp_path = format!("{}/{}_temp.mp4", output_dir, output_filename);

                    let convert_result = app.shell()
                        .sidecar("ffmpeg")
                        .unwrap()
                        .args([
                            "-i", &input_path,
                            "-c:v", "libx264",
                            "-pix_fmt", "yuv420p",
                            "-c:a", "aac",
                            "-y", &temp_path,
                        ])
                        .output()
                        .await;

                    if convert_result.is_ok() {
                        let _ = std::fs::remove_file(&input_path);
                        let _ = std::fs::rename(&temp_path, &input_path);
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
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                {
                    let mut q = queue.lock().unwrap();
                    q.update(&id, |item| {
                        item.status = DownloadStatus::Failed(stderr.clone());
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
    queue: State<'_, SharedQueue>,
    id: String,
) -> Result<bool, String> {
    {
        let mut q = queue.lock().map_err(|e| e.to_string())?;
        q.update(&id, |item| {
            item.status = DownloadStatus::Cancelled;
        });
    }
    Ok(true)
}

#[tauri::command]
pub async fn get_queue(queue: State<'_, SharedQueue>) -> Result<Vec<DownloadItem>, String> {
    let q = queue.lock().map_err(|e| e.to_string())?;
    Ok(q.snapshot())
}
