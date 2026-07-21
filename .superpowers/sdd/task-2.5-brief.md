### Task 2.5: Create `usePresetStore`

**Files:**
- Create: `src/stores/preset-store.ts`

Defined as a standalone store:

```typescript
import { create } from 'zustand';
import { logger } from '../shared/lib/logger';

export interface Preset {
  id: string;
  name: string;
  downloadType: 'video' | 'audio';
  encoding: string;
  premiereMode: boolean;
}

const STORAGE_KEY = 'ytmate-presets';

const defaultPreset: Preset = {
  id: 'premiere-pro',
  name: 'Premiere Pro',
  downloadType: 'video',
  encoding: 'mp4_h264',
  premiereMode: true,
};

interface PresetState {
  presets: Preset[];
  selectedPresetId: string | null;

  addPreset: (name: string, options: Omit<Preset, 'id' | 'name'>) => void;
  removePreset: (id: string) => void;
  selectPreset: (id: string | null) => void;
  loadPresets: () => void;
  savePresets: () => void;
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [defaultPreset],
  selectedPresetId: null,

  addPreset: (name, options) => {
    const id = crypto.randomUUID();
    set((s) => ({ presets: [...s.presets, { id, name, ...options }] }));
    get().savePresets();
  },

  removePreset: (id) => {
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
    get().savePresets();
  },

  selectPreset: (selectedPresetId) => set({ selectedPresetId }),

  loadPresets: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) set({ presets: JSON.parse(raw) });
    } catch { logger.warn('Failed to load presets from localStorage'); }
  },

  savePresets: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().presets));
    } catch { logger.warn('Failed to save presets to localStorage'); }
  },
}));
```

- [ ] **Create `preset-store.ts`** with the implementation above.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

