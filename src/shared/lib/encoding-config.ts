export interface VideoEncoding {
  key: string;
  label: string;
  ext: string;
  mergeFormat: string;
}

export interface AudioEncoding {
  key: string;
  label: string;
  ext: string;
  audioFormat: string;
  embedThumbnail: boolean;
}

export const encodingConfig = {
  video: [
    { key: 'mp4_h264', label: 'MP4 (H.264)', ext: 'mp4', mergeFormat: 'mp4' },
    { key: 'mp4_h265', label: 'MP4 (H.265/HEVC)', ext: 'mp4', mergeFormat: 'mp4' },
    { key: 'mkv', label: 'MKV', ext: 'mkv', mergeFormat: 'mkv' },
    { key: 'webm', label: 'WebM', ext: 'webm', mergeFormat: 'webm' },
  ],
  audio: [
    { key: 'mp3', label: 'MP3', ext: 'mp3', audioFormat: 'mp3', embedThumbnail: true },
    { key: 'm4a', label: 'M4A (AAC)', ext: 'm4a', audioFormat: 'aac', embedThumbnail: true },
    { key: 'flac', label: 'FLAC', ext: 'flac', audioFormat: 'flac', embedThumbnail: false },
    { key: 'opus', label: 'Opus', ext: 'opus', audioFormat: 'opus', embedThumbnail: false },
    { key: 'wav', label: 'WAV', ext: 'wav', audioFormat: 'wav', embedThumbnail: false },
  ],
} as const;

export type VideoEncodingKey = (typeof encodingConfig.video)[number]['key'];
export type AudioEncodingKey = (typeof encodingConfig.audio)[number]['key'];
