import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '../shared/lib/logger';

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: string;
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
    // Will be wired up in Phase 5 with the hook pattern
  },

  cancelDownload: async () => {
    const item = get().downloadItem;
    if (!item) return;
    try {
      await invoke('cancel_download', { id: item.id });
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
