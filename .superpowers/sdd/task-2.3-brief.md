### Task 2.3: Create `usePlaylistStore`

**Files:**
- Create: `src/stores/playlist-store.ts`

Extracts from `download-store.ts`: `playlistEntries`, `selectedEntryIndices`, `selectAllPlaylist`, `playlistItemProgress`, and actions `toggleEntry`, `toggleSelectAll`.

```typescript
import { create } from 'zustand';

export interface PlaylistItemProgress {
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  progress: number;
  speed: string;
  eta: string;
  error?: string;
}

interface PlaylistState {
  entries: PlaylistEntry[];
  selectedIndices: number[];
  selectAll: boolean;
  itemProgress: Record<number, PlaylistItemProgress>;

  setEntries: (entries: PlaylistEntry[]) => void;
  toggleEntry: (idx: number) => void;
  toggleSelectAll: () => void;
  setItemProgress: (idx: number, progress: PlaylistItemProgress) => void;
  resetPlaylist: () => void;
}

interface PlaylistEntry {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  url: string;
}

const initialState = {
  entries: [],
  selectedIndices: [],
  selectAll: true,
  itemProgress: {},
};

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  ...initialState,

  setEntries: (entries) => set({ entries, selectedIndices: entries.map((_, i) => i) }),

  toggleEntry: (idx) => {
    const indices = get().selectedIndices;
    set({
      selectedIndices: indices.includes(idx)
        ? indices.filter((i) => i !== idx)
        : [...indices, idx],
      selectAll: false,
    });
  },

  toggleSelectAll: () => {
    const all = get().entries.map((_, i) => i);
    set((s) => ({
      selectAll: !s.selectAll,
      selectedIndices: s.selectAll ? [] : all,
    }));
  },

  setItemProgress: (idx, progress) =>
    set((s) => ({
      itemProgress: { ...s.itemProgress, [idx]: progress },
    })),

  resetPlaylist: () => set(initialState),
}));
```

- [ ] **Create `playlist-store.ts`** with the implementation above.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

