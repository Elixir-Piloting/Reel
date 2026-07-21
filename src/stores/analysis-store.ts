import { create } from 'zustand';
import type { VideoMeta, FormatInfo, AnalyzeResponse } from '../shared/lib/types';
import { dataService } from '../shared/lib/data-service';
import { logger } from '../shared/lib/logger';

export type Phase = 'idle' | 'analyzing' | 'ready' | 'playlist' | 'downloading' | 'completed' | 'error';

interface AnalysisState {
  url: string;
  metadata: VideoMeta | null;
  formats: FormatInfo[];
  qualityOptions: { value: string; label: string }[];
  error: string | null;
  phase: Phase;

  setUrl: (url: string) => void;
  setPhase: (phase: Phase) => void;
  setError: (error: string | null) => void;
  analyzeUrl: (url?: string) => Promise<void>;
  buildQualityOptions: (formats: FormatInfo[]) => void;
}

let analyzeGen = 0;

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  url: '',
  metadata: null,
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
    set({ phase: 'analyzing', error: null, metadata: null, formats: [], qualityOptions: [] });
    try {
      const result = await dataService.analyzeVideo(url);
      if (gen !== analyzeGen) return;
      set({
        metadata: result.video_meta,
        formats: result.formats || [],
        phase: result.playlist_entries?.length ? 'playlist' : 'ready',
      });
      get().buildQualityOptions(result.formats || []);
    } catch (e) {
      if (gen !== analyzeGen) return;
      set({ phase: 'error', error: String(e) });
    }
  },

  buildQualityOptions: (formats: FormatInfo[]) => {
    const grouped = new Map<string, { value: string; label: string }>();
    for (const f of formats) {
      const h = parseInt(f.resolution.split('x')[1] ?? '0', 10);
      const key = h > 0 ? `${h}p` : 'audio';
      if (grouped.has(key)) continue;
      const size = f.filesize ? ` (${(f.filesize / 1024 / 1024).toFixed(1)}MB)` : '';
      grouped.set(key, { value: f.format_id, label: `${key}${size}` });
    }
    set({ qualityOptions: Array.from(grouped.values()) });
  },
}));
