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
        const item = await dataService.enqueueDownload({
          url: entry.url,
          format_id,
          filename: entry.title,
          output_dir: effectiveDir,
          start_time: null,
          end_time: null,
          premiere_mode: premiereMode,
          download_type: downloadType === 'video' ? 'Video' : 'Audio',
          video_title: entry.title,
          channel: '',
          duration: entry.duration || 0,
          thumbnail_url: entry.thumbnail,
          has_audio: downloadType === 'video',
          encoding,
        });

        const deferred = new Deferred<void>();
        const unsubItem = await listen<any>('download-item-update', (e) => {
          const st = typeof e.payload.status === 'string' ? e.payload.status : '';
          if (e.payload.id === item.id && ['Completed', 'Failed', 'Cancelled'].includes(st)) {
            deferred.resolve();
          }
        });
        const unsubProgress = await listen<any>('download-progress', (e) => {
          if (e.payload.id === item.id && e.payload.progress !== undefined && !cancelled) {
            setItemProgress(idx, { status: 'downloading', progress: e.payload.progress, speed: e.payload.speed || '', eta: e.payload.eta || '' });
          }
        });

        const timeout = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Download timed out after 30 minutes')), 1_800_000),
        );
        await Promise.race([deferred.promise, timeout]);
        cancelled = true;
        unsubItem();
        unsubProgress();

        const qItems = await dataService.getQueue();
        const finalItem = qItems.find((i: any) => i.id === item.id);
        const finalStatusStr = typeof finalItem?.status === 'string' ? finalItem.status : '';
        const finalStatus = finalStatusStr === 'Completed' ? 'completed' : finalStatusStr === 'Cancelled' ? 'cancelled' : 'failed';
        setItemProgress(idx, { status: finalStatus, progress: finalStatus === 'completed' ? 100 : 0, speed: '', eta: '' });
      } catch (e) {
        cancelled = true;
        const msg = String(e);
        setItemProgress(idx, { status: msg.includes('timed out') ? 'failed' : 'failed', progress: 0, speed: '', eta: '', error: msg });
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
      const prev = get().downloadItem;
      const payload = event.payload;
      const statusStr = typeof payload.status === 'string' ? payload.status : Object.keys(payload.status as Record<string, string>)[0] || 'Unknown';
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
        useAnalysisStore.getState().setPhase(statusStr === 'Completed' ? 'completed' : 'error');
      }

      if (statusStr === 'Completed' && (!prev || prev.status !== 'Completed')) {
        const title = payload.title || get().downloadItem?.title || '';
        notify.downloadComplete(title, () => dataService.openInExplorer(payload.output_path));
      } else if (statusStr === 'Failed' && (!prev || prev.status !== 'Failed')) {
        const title = payload.title || get().downloadItem?.title || '';
        const errMsg = typeof payload.status === 'object' ? Object.values(payload.status as Record<string, string>)[0] : payload.status;
        notify.downloadFailed(title, String(errMsg || 'Unknown error'), () => get().startDownload());
      }
    });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unlistenProgress();
      unlistenItem();
    };
  }}),
  {
    name: 'download-execution',
    storage: createJSONStorage(() => sessionStorage),
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
