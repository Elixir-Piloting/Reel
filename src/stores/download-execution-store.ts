import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { dataService } from '../shared/lib/data-service';
import { logger } from '../shared/lib/logger';
import { useAnalysisStore } from './analysis-store';
import { useOptionsStore } from './options-store';

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: string | Record<string, string>;
  progress: number;
  speed: string;
  eta: string;
  output_path: string;
  filename: string;
}

interface DownloadExecutionState {
  isDownloading: boolean;
  downloadProgress: number;
  downloadSpeed: string;
  downloadEta: string;
  downloadStatus: string;
  downloadItem: DownloadItem | null;
  completedFileName: string | null;

  setDownloading: (v: boolean) => void;
  startDownload: () => Promise<void>;
  startPlaylistDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  reset: () => void;
  initProgressListener: () => Promise<() => void>;
}

export const useDownloadExecutionStore = create<DownloadExecutionState>((set, get) => ({
  isDownloading: false,
  downloadProgress: 0,
  downloadSpeed: '',
  downloadEta: '',
  downloadStatus: '',
  downloadItem: null,
  completedFileName: null,

  setDownloading: (v) => set({ isDownloading: v }),

  startDownload: async () => {
    const { url, metadata } = useAnalysisStore.getState();
    const { selectedQuality, encoding, premiereMode, filename, outputDir, startTime, endTime, downloadType } = useOptionsStore.getState();
    if (!url || !metadata) return;
    set({ isDownloading: true, downloadProgress: 0, downloadStatus: 'Queued' });
    try {
      const item = await dataService.enqueueDownload({
        url,
        format_id: selectedQuality,
        filename: filename || metadata.title,
        output_dir: outputDir,
        start_time: startTime > 0 ? String(startTime) : null,
        end_time: endTime > 0 ? String(endTime) : null,
        premiere_mode: premiereMode,
        download_type: downloadType === 'video' ? 'Video' : 'Audio',
        video_title: metadata.title,
        thumbnail_url: metadata.thumbnail_url,
        has_audio: downloadType === 'video',
        encoding,
      });
      set({ downloadItem: item });
    } catch (e) {
      logger.error('Failed to start download', { error: e });
      set({ isDownloading: false, downloadStatus: 'Failed' });
    }
  },

  startPlaylistDownload: async () => {
    // Will be wired in Phase 5
  },

  cancelDownload: async () => {
    const item = get().downloadItem;
    if (!item) return;
    try {
      await dataService.cancelDownload(item.id);
      set({ isDownloading: false });
    } catch (e) {
      logger.error('Failed to cancel download', { error: e });
    }
  },

  reset: () => set({
    isDownloading: false,
    downloadProgress: 0,
    downloadSpeed: '',
    downloadEta: '',
    downloadStatus: '',
    downloadItem: null,
    completedFileName: null,
  }),

  initProgressListener: async () => {
    const unlistenProgress = await listen<{ id: string; progress: number; speed: string; eta: string; status: string }>(
      'download-progress',
      (event) => {
        set({
          downloadProgress: event.payload.progress,
          downloadSpeed: event.payload.speed,
          downloadEta: event.payload.eta,
          downloadStatus: event.payload.status,
        });
      },
    );
    const unlistenItem = await listen<DownloadItem>('download-item-update', (event) => {
      set({ downloadItem: event.payload });
    });
    return () => {
      unlistenProgress();
      unlistenItem();
    };
  },
}));
