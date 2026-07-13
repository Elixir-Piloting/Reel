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

export function onDownloadProgress(
  callback: (data: DownloadItem) => void
) {
  return listen<DownloadItem>("download-progress", (event) => {
    callback(event.payload);
  });
}
