import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VideoMeta, FormatInfo, AnalyzeResponse } from '../shared/lib/types';
import { dataService } from '../shared/lib/data-service';
import { logger } from '../shared/lib/logger';
import { notify } from '../features/notifications/notificationService';
import { usePlaylistStore } from './playlist-store';
import { useOptionsStore } from './options-store';
import { getCachedAnalysis, setCachedAnalysis } from '../shared/lib/analysis-cache';

export type Phase = 'idle' | 'analyzing' | 'ready' | 'playlist' | 'downloading' | 'completed' | 'error';

interface AnalysisState {
  url: string;
  metadata: VideoMeta | null;
  playlistTitle: string | null;
  formats: FormatInfo[];
  qualityOptions: { value: string; label: string }[];
  error: string | null;
  phase: Phase;

  setUrl: (url: string) => void;
  setPhase: (phase: Phase) => void;
  setError: (error: string | null) => void;
  analyzeUrl: (url?: string) => Promise<void>;
  buildQualityOptions: (formats: FormatInfo[]) => void;
  rebuildQualityOptions: () => void;
}

let analyzeGen = 0;

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
  url: '',
  metadata: null,
  playlistTitle: null,
  formats: [],
  qualityOptions: [],
  error: null,
  phase: 'idle',

  setUrl: (url: string) => set({ url }),

  setPhase: (phase: Phase) => set({ phase }),

  setError: (error: string | null) => set({ error }),

  analyzeUrl: async (inputUrl?: string) => {
    const url = (inputUrl !== undefined ? inputUrl : get().url).trim();
    if (!url) return;
    const gen = ++analyzeGen;
    if (url !== get().url) {
      useOptionsStore.getState().resetOptions();
    }
    set({ phase: 'analyzing', error: null, metadata: null, playlistTitle: null, formats: [], qualityOptions: [] });
    try {
      const cached = getCachedAnalysis(url);
      if (cached) {
        const isPlaylist = !!cached.playlist_entries?.length;
        set({
          metadata: cached.video_meta,
          playlistTitle: isPlaylist ? cached.playlist_title || null : null,
          formats: cached.formats || [],
          phase: isPlaylist ? 'playlist' : 'ready',
        });
        get().buildQualityOptions(cached.formats || []);
        if (isPlaylist && cached.playlist_entries) {
          usePlaylistStore.getState().setEntries(cached.playlist_entries.map((e) => ({ id: e.url, title: e.title, duration: e.duration, thumbnail: e.thumbnail, url: e.url })));
          notify.playlistFound(cached.playlist_entries.length);
          if (!useOptionsStore.getState().selectedQuality) {
            useOptionsStore.getState().setSelectedQuality('best');
          }
        } else if (cached.video_meta) {
          notify.analysisComplete(cached.video_meta.title);
        }
        return;
      }
      const result = await dataService.analyzeVideo(url);
      if (gen !== analyzeGen) return;
      setCachedAnalysis(url, result);
      const isPlaylist = !!result.playlist_entries?.length;
      set({
        metadata: result.video_meta,
        playlistTitle: isPlaylist ? result.playlist_title || null : null,
        formats: result.formats || [],
        phase: isPlaylist ? 'playlist' : 'ready',
      });
      get().buildQualityOptions(result.formats || []);
      if (isPlaylist && result.playlist_entries) {
        usePlaylistStore.getState().setEntries(result.playlist_entries.map((e) => ({ id: e.url, title: e.title, duration: e.duration, thumbnail: e.thumbnail, url: e.url })));
        notify.playlistFound(result.playlist_entries.length);
        if (!useOptionsStore.getState().selectedQuality) {
          useOptionsStore.getState().setSelectedQuality('best');
        }
      } else if (result.video_meta) {
        notify.analysisComplete(result.video_meta.title);
      }
    } catch (e) {
      if (gen !== analyzeGen) return;
      set({ phase: 'error', error: String(e) });
    }
  },

  buildQualityOptions: (formats: FormatInfo[]) => {
    const downloadType = useOptionsStore.getState().downloadType;
    const bestLabel = 'Best';
    const bestValue = downloadType === 'audio' ? 'bestaudio/best' : 'bestvideo+bestaudio/best';
    const opts: { value: string; label: string }[] = [{ value: bestValue, label: bestLabel }];
    const filtered = formats.filter(f => {
      if (downloadType === 'video') {
        const hasVideo = f.video_codec && f.video_codec !== 'none' && f.video_codec !== '';
        return hasVideo;
      }
      return f.audio_codec && f.audio_codec !== 'none' && f.audio_codec !== '';
    });
    const grouped = new Map<string, { value: string; label: string }>();
    for (const f of filtered) {
      const h = parseInt(
        f.resolution.includes('x')
          ? f.resolution.split('x')[1]
          : f.resolution.replace(/(\d+).*/, '$1'),
        10,
      );
      const key = h > 0 ? `${h}p` : 'audio';
      if (grouped.has(key)) continue;
      const size = f.filesize ? ` (${(f.filesize / 1024 / 1024).toFixed(1)}MB)` : '';
      grouped.set(key, { value: f.format_id, label: `${key}${size}` });
    }
    const arr = [...opts, ...Array.from(grouped.values())];
    set({ qualityOptions: arr });
    const current = useOptionsStore.getState().selectedQuality;
    if ((!current || current === 'best') && arr.length > 0) {
      useOptionsStore.getState().setSelectedQuality(arr[0].label);
    }
  },

  rebuildQualityOptions: () => {
    const formats = get().formats;
    if (formats.length > 0) get().buildQualityOptions(formats);
  },
}),
  {
    name: 'analysis-store',
    storage: createJSONStorage(() => sessionStorage),
    partialize: (state) => ({
      url: state.url,
      metadata: state.metadata,
      playlistTitle: state.playlistTitle,
      formats: state.formats,
      qualityOptions: state.qualityOptions,
      error: state.error,
      phase: state.phase,
    }),
  }),
);
