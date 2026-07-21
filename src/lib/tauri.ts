import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface VideoMeta {
  title: string;
  duration: number;
  channel: string;
  upload_date: string;
  thumbnail_url: string;
  webpage_url: string;
  is_playlist: boolean;
  playlist_title: string | null;
  playlist_id: string | null;
  playlist_count: number | null;
}

export interface PlaylistEntry {
  index: number;
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
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
  download_type: "Video" | "Audio";
  video_title: string;
  thumbnail_url: string;
  has_audio: boolean;
  encoding: string;
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
  status: string | Record<string, string>;
  thumbnail_url: string;
  ext: string;
  format_id: string;
  download_type: string;
  has_audio: boolean;
}

export interface AppSettings {
  default_download_folder: string;
  auto_update_ytdlp: boolean;
  auto_convert_premiere: boolean;
  show_all_formats: boolean;
}

export interface QualityOption {
  label: string;
  height: number;
  formatId: string;
  hasAudio: boolean;
  fps: number | null;
  filesize: number | null;
}

export interface Preset {
  id: string;
  name: string;
  downloadType: "audio-only" | "video+audio";
  encoding: string;
  premiereMode: boolean;
}

export interface AnalyzeResponse {
  is_playlist: boolean;
  video_meta: VideoMeta | null;
  formats: FormatInfo[] | null;
  playlist_title: string | null;
  playlist_entries: PlaylistEntry[] | null;
}

export async function analyzeVideo(url: string): Promise<AnalyzeResponse> {
  return invoke("analyze_video", { url });
}

export async function enqueueDownload(request: DownloadRequest): Promise<DownloadItem> {
  return invoke<DownloadItem>("enqueue_download", { request });
}

export async function cancelDownload(id: string): Promise<boolean> {
  return invoke("cancel_download", { id });
}

export async function getQueue(): Promise<DownloadItem[]> {
  return invoke("get_queue");
}

export async function removeFromQueue(id: string): Promise<boolean> {
  return invoke("remove_from_queue", { id });
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

export async function openInExplorer(path: string): Promise<void> {
  return invoke("open_in_explorer", { path });
}

export function onDownloadProgress(
  callback: (data: DownloadItem) => void
) {
  return listen<DownloadItem>("download-progress", (event) => {
    callback(event.payload);
  });
}
