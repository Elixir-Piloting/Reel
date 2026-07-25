import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface PlaylistItemProgress {
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
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
  setItemDownloadId: (idx: number, downloadId: string) => void;
  setItemProgress: (idx: number, progress: PlaylistItemProgress) => void;
  resetPlaylist: () => void;
}

interface PlaylistEntry {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  url: string;
  channel?: string;
  downloadId?: string;
}

const initialState = {
  entries: [],
  selectedIndices: [],
  selectAll: true,
  itemProgress: {},
};

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
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

  setItemDownloadId: (idx: number, downloadId: string) => set((state) => {
    const entries = [...state.entries];
    if (entries[idx]) {
      entries[idx] = { ...entries[idx], downloadId };
    }
    return { entries };
  }),

  setItemProgress: (idx, progress) =>
    set((s) => ({
      itemProgress: { ...s.itemProgress, [idx]: progress },
    })),

  resetPlaylist: () => set(initialState),
}),
{
  name: 'playlist-store',
    storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    entries: state.entries,
    selectedIndices: state.selectedIndices,
    selectAll: state.selectAll,
    itemProgress: state.itemProgress,
  }),
},
));
