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
  filesize_estimated: boolean;
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
  channel: string;
  duration: number;
  thumbnail_url: string;
  has_audio: boolean;
  encoding: string;
  filename_pattern?: string;
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
  error?: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  ext: string;
  format_id: string;
  download_type: string;
  has_audio: boolean;
}

export interface AppSettings {
  default_download_folder: string;
  auto_update_ytdlp: boolean;
  show_all_formats: boolean;
  max_concurrent_downloads: number;
  filename_pattern?: string;
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

export interface ToolStatus {
  installed: string | null;
  latest: string | null;
  state: "up_to_date" | "updating" | "stale" | "failed" | "offline" | "missing";
}

export interface BinaryStatus {
  ytdlp: ToolStatus;
  ffmpeg: ToolStatus;
}
