import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { dataService } from '../shared/lib/data-service';
import { logger } from '../shared/lib/logger';
import { useAnalysisStore } from './analysis-store';
import { useOptionsStore } from './options-store';
import { usePlaylistStore } from './playlist-store';
import { useSettingsStore } from './settings-store';
import { notify } from '../features/notifications/notificationService';
import { Deferred } from '../shared/lib/deferred';
import type { FormatInfo } from '../shared/lib/types';

function qualityTierFromFormatId(formatId: string, formats: FormatInfo[]): string {
  const fmt = formats.find(f => f.format_id === formatId);
  if (fmt) {
    const height = parseInt(fmt.resolution.split('x')[1] || fmt.resolution.replace(/\D/g, ''), 10);
    if (height > 0) {
      return `bestvideo[height<=${height}]+bestaudio/best`;
    }
  }
  return 'best';
}

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
  error?: string;
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
  unlistenRef: (() => void) | null;
}

export const useDownloadExecutionStore = create<DownloadExecutionState>()(
  persist(
    (set, get) => ({
  isDownloading: false,
  downloadProgress: 0,
  downloadSpeed: '',
  downloadEta: '',
  downloadStatus: '',
  downloadItem: null,
  completedFileName: null,
  unlistenRef: null,

  setDownloading: (v) => set({ isDownloading: v }),

  startDownload: async () => {
    const { url, metadata, qualityOptions } = useAnalysisStore.getState();
    const { selectedQuality, encoding, premiereMode, filename, outputDir, startTime, endTime, downloadType } = useOptionsStore.getState();
    const settings = useSettingsStore.getState().settings;
    const effectiveDir = outputDir || settings.default_download_folder || '';
    if (!url || !metadata) return;
    const qual = qualityOptions.find((q) => q.label === selectedQuality);
    const format_id = qual ? qual.value : selectedQuality;
    useAnalysisStore.getState().setPhase('downloading');
    set({ isDownloading: true, downloadProgress: 0, downloadStatus: 'Queued' });
    try {
      const item = await dataService.enqueueDownload({
        url,
        format_id,
        filename: filename || metadata.title,
        output_dir: effectiveDir,
        start_time: startTime > 0 ? String(startTime) : null,
        end_time: endTime > 0 ? String(endTime) : null,
        premiere_mode: premiereMode,
        download_type: downloadType === 'video' ? 'Video' : 'Audio',
        video_title: metadata.title,
        channel: metadata.channel,
        duration: metadata.duration,
        thumbnail_url: metadata.thumbnail_url,
        has_audio: downloadType === 'video',
        encoding,
      });
      set({ downloadItem: item });
      useAnalysisStore.getState().setPhase('idle');
      useAnalysisStore.getState().setUrl('');
      notify.downloadStarted(metadata.title);
    } catch (e) {
      logger.error('Failed to start download', { error: e });
      set({ isDownloading: false, downloadStatus: 'Failed' });
    }
  },

  startPlaylistDownload: async () => {
    const { entries, selectedIndices, setItemProgress } = usePlaylistStore.getState();
    const { downloadType, selectedQuality, encoding, premiereMode, outputDir } = useOptionsStore.getState();
    const settings = useSettingsStore.getState().settings;
    const effectiveDir = outputDir || settings.default_download_folder || '';
    const { url } = useAnalysisStore.getState();
    const qualityOptions = useAnalysisStore.getState().qualityOptions;

    if (!url || entries.length === 0) return;
    useAnalysisStore.getState().setPhase('downloading');
    set({ isDownloading: true, downloadProgress: 0, downloadStatus: 'Queued' });

    const qual = qualityOptions.find((q) => q.label === selectedQuality) || qualityOptions.find((q) => q.value === selectedQuality);
    const format_id = qual ? qual.value : (selectedQuality && selectedQuality !== '' ? selectedQuality : 'best');
    const concurrency = Math.max(1, settings.max_concurrent_downloads || 3);

    for (const idx of selectedIndices) {
      setItemProgress(idx, { status: 'queued', progress: 0, speed: '', eta: '' });
    }

    const downloadOne = async (idx: number): Promise<void> => {
      const entry = entries[idx];
      let cancelled = false;
      setItemProgress(idx, { status: 'downloading', progress: 0, speed: '', eta: '' });
      try {
        const formats = useAnalysisStore.getState().formats;
        const formatArg = qualityTierFromFormatId(format_id, formats);
        const item = await dataService.enqueueDownload({
          url: entry.url,
          format_id: formatArg,
          filename: entry.title,
          output_dir: effectiveDir,
          start_time: null,
          end_time: null,
          premiere_mode: premiereMode,
          download_type: downloadType === 'video' ? 'Video' : 'Audio',
          video_title: entry.title,
          channel: entry.channel || '',
          duration: entry.duration || 0,
          thumbnail_url: entry.thumbnail || '',
          has_audio: downloadType === 'video',
          encoding,
        });

        usePlaylistStore.getState().setItemDownloadId(idx, item.id);

        const deferred = new Deferred<void>();
        const DOWNLOAD_TIMEOUT = 5 * 60 * 1000;
        const STALL_TIMEOUT = 60 * 1000;

        let lastProgressTime = Date.now();
        let lastProgressValue = 0;
        let finalItem: any = null;

        const unsubItem = await listen<any>('download-item-update', (e) => {
          if (e.payload.id === item.id) {
            finalItem = e.payload;
            const st = typeof e.payload.status === 'string' ? e.payload.status : '';
            if (['Completed', 'Failed', 'Cancelled'].includes(st)) {
              deferred.resolve();
            }
          }
        });
        const unsubProgress = await listen<any>('download-progress', (e) => {
          if (e.payload.id === item.id && e.payload.progress !== undefined && !cancelled) {
            setItemProgress(idx, { status: 'downloading', progress: e.payload.progress, speed: e.payload.speed || '', eta: e.payload.eta || '' });
            if (e.payload.progress > lastProgressValue) {
              lastProgressTime = Date.now();
              lastProgressValue = e.payload.progress;
            }
          }
        });

        const timeout = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Download timed out')), DOWNLOAD_TIMEOUT),
        );

        const stallDetector = (async () => {
          while (true) {
            await new Promise(r => setTimeout(r, STALL_TIMEOUT));
            if (Date.now() - lastProgressTime >= STALL_TIMEOUT && lastProgressValue > 0) {
              throw new Error('Download stalled');
            }
          }
        })();

        await Promise.race([deferred.promise, timeout, stallDetector]);
        cancelled = true;
        unsubItem();
        unsubProgress();

        const finalStatusStr = typeof finalItem?.status === 'string' ? finalItem.status : '';
        const finalStatus = finalStatusStr === 'Completed' ? 'completed' : finalStatusStr === 'Cancelled' ? 'cancelled' : 'failed';
        setItemProgress(idx, { status: finalStatus, progress: finalStatus === 'completed' ? 100 : 0, speed: '', eta: '' });
      } catch (e) {
        cancelled = true;
        const msg = String(e);
        setItemProgress(idx, { status: msg.includes('timed out') || msg.includes('stalled') ? 'failed' : 'failed', progress: 0, speed: '', eta: '', error: msg });
      }
    };

    const indices = [...selectedIndices];
    let i = 0;
    const next = (): Promise<void> => {
      if (i >= indices.length) return Promise.resolve();
      const idx = indices[i++];
      return downloadOne(idx).finally(next);
    };
    const workers = Array.from({ length: Math.min(concurrency, indices.length) }, () => next());
    await Promise.all(workers);

    await new Promise(resolve => setTimeout(resolve, 500));

    set({ isDownloading: false });
    useAnalysisStore.getState().setPhase('completed');
  },

  cancelDownload: async () => {
    const item = get().downloadItem;
    if (!item) {
      logger.warn('cancelDownload called but no downloadItem');
      return;
    }
    set({ downloadStatus: 'Cancelled', isDownloading: false });
    dataService.cancelDownload(item.id).catch((e) =>
      logger.error('Failed to cancel download on backend', { error: e }),
    );
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
    if (get().unlistenRef) {
      try { get().unlistenRef!(); } catch (e) {
        logger.warn('Failed to unregister stale listener', { error: e });
      }
      get().unlistenRef = null;
    }
    let rafId: number | null = null;
    let pending: Partial<DownloadExecutionState> = {};

    const batch = (update: Partial<DownloadExecutionState>) => {
      Object.assign(pending, update);
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (get().downloadStatus === 'Cancelled') {
            pending = {};
            rafId = null;
            return;
          }
          set(pending);
          pending = {};
          rafId = null;
        });
      }
    };

    const unlistenProgress = await listen<{ id: string; progress: number; speed: string; eta: string; status: string }>(
      'download-progress',
      (event) => {
        const currentItem = get().downloadItem;
        if (!currentItem || event.payload.id !== currentItem.id) return;
        if (get().downloadStatus === 'Cancelled') return;
        batch({
          downloadProgress: event.payload.progress,
          downloadSpeed: event.payload.speed,
          downloadEta: event.payload.eta,
          downloadStatus: event.payload.status,
        });
      },
    );
    const unlistenItem = await listen<DownloadItem>('download-item-update', (event) => {
      const currentItem = get().downloadItem;
      if (!currentItem || event.payload.id !== currentItem.id) return;
      const prev = currentItem;
      const payload = event.payload;
      const statusStr = String(payload.status ?? 'Unknown');
      const isDone = ['Completed', 'Failed', 'Cancelled'].includes(statusStr);
      if (get().downloadStatus === 'Cancelled' && !isDone) return;
      set({
        downloadItem: payload,
        downloadProgress: payload.progress,
        downloadStatus: statusStr,
        isDownloading: !isDone,
        completedFileName: isDone ? payload.filename : get().completedFileName,
      });
      if (isDone) {
        if (statusStr === 'Completed') {
          useAnalysisStore.getState().reset();
        } else {
          useAnalysisStore.getState().setPhase('error');
        }
      }

      if (statusStr === 'Completed' && (!prev || prev.status !== 'Completed')) {
        const title = payload.title || get().downloadItem?.title || '';
        notify.downloadComplete(title, () => dataService.openInExplorer(payload.output_path));
      } else if (statusStr === 'Failed' && (!prev || prev.status !== 'Failed')) {
        const title = payload.title || get().downloadItem?.title || '';
        const errMsg = (payload as any).error || payload.status;
        notify.downloadFailed(title, String(errMsg || 'Unknown error'), () => get().startDownload());
      }
    });
    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unlistenProgress();
      unlistenItem();
      set({ unlistenRef: null });
    };
    set({ unlistenRef: cleanup });
    return cleanup;
  }}),
  {
    name: 'download-execution',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      isDownloading: state.isDownloading,
      downloadProgress: state.downloadProgress,
      downloadSpeed: state.downloadSpeed,
      downloadEta: state.downloadEta,
      downloadStatus: state.downloadStatus,
      downloadItem: state.downloadItem,
      completedFileName: state.completedFileName,
    }),
  }),
);
