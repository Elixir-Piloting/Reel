### Task 2.1: Create `useAnalysisStore`

**Files:**
- Create: `src/stores/analysis-store.ts`

Extracts from `download-store.ts`: `url`, `metadata`, `formats`, `qualityOptions`, `error`, `phase`, and actions `setUrl`, `analyzeUrl`, `setError`, `buildQualityOptions`.

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { VideoMeta, FormatInfo, AnalyzeResponse } from '../lib/tauri';
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
      const result = await invoke<AnalyzeResponse>('analyze_video', { url });
      if (gen !== analyzeGen) return;
      set({
        metadata: result.metadata,
        formats: result.formats,
        playlistEntries: result.playlist_entries || [],
        phase: result.playlist_entries?.length ? 'playlist' : 'ready',
      });
      get().buildQualityOptions(result.formats);
    } catch (e) {
      if (gen !== analyzeGen) return;
      set({ phase: 'error', error: String(e) });
    }
  },

  buildQualityOptions: (formats: FormatInfo[]) => {
    const grouped = new Map<string, { value: string; label: string }>();
    for (const f of formats) {
      const key = f.height ? `${f.height}p` : 'audio';
      if (!grouped.has(key) || f.filesize > (formats.find(f2 => `${f2.height}p` === key)?.filesize ?? 0)) {
        const size = f.filesize ? ` (${(f.filesize / 1024 / 1024).toFixed(1)}MB)` : '';
        grouped.set(key, { value: f.format_id, label: `${key}${size}` });
      }
    }
    set({ qualityOptions: Array.from(grouped.values()) });
  },
}));
```

- [ ] **Create `analysis-store.ts`** with the implementation above.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

