import { invoke } from '@tauri-apps/api/core';
import type { AnalyzeResponse, DownloadItem, AppSettings, DownloadRequest } from './types';

class DataService {
  async analyzeVideo(url: string): Promise<AnalyzeResponse> {
    return invoke<AnalyzeResponse>('analyze_video', { url });
  }
  async enqueueDownload(request: DownloadRequest): Promise<DownloadItem> {
    return invoke<DownloadItem>('enqueue_download', { request });
  }
  async cancelDownload(id: string): Promise<boolean> {
    return invoke<boolean>('cancel_download', { id });
  }
  async getQueue(): Promise<DownloadItem[]> {
    return invoke<DownloadItem[]>('get_queue');
  }
  async removeFromQueue(id: string): Promise<boolean> {
    return invoke<boolean>('remove_from_queue', { id });
  }
  async openInExplorer(path: string): Promise<void> {
    return invoke<void>('open_in_explorer', { path });
  }
  async browseFolder(): Promise<string | null> {
    return invoke<string | null>('browse_folder');
  }
  async getSettings(): Promise<AppSettings> {
    return invoke<AppSettings>('get_settings');
  }
  async saveSettings(settings: AppSettings): Promise<void> {
    return invoke<void>('save_settings', { settings });
  }
  async retryDownload(id: string): Promise<DownloadItem> {
    return invoke<DownloadItem>('retry_download', { id });
  }
  async cancelAllDownloads(): Promise<number> {
    return invoke<number>('cancel_all_downloads');
  }
  async pauseDownload(id: string): Promise<boolean> {
    return invoke<boolean>('pause_download', { id });
  }
  async resumeDownload(id: string): Promise<boolean> {
    return invoke<boolean>('resume_download', { id });
  }
  async pauseAllDownloads(): Promise<number> {
    return invoke<number>('pause_all_downloads');
  }
  async resumeAllDownloads(): Promise<number> {
    return invoke<number>('resume_all_downloads');
  }
  async updateYtdlp(): Promise<string> {
    return invoke<string>('update_ytdlp');
  }
}

export const dataService = new DataService();
