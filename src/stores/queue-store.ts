import { create } from "zustand";
import type { DownloadItem } from "../lib/tauri";
import { getQueue, onDownloadProgress } from "../lib/tauri";

interface QueueStore {
  items: DownloadItem[];
  loadQueue: () => Promise<void>;
  updateItem: (item: DownloadItem) => void;
  initListener: () => () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],

  loadQueue: async () => {
    try {
      const items = await getQueue();
      set({ items });
    } catch {
      // ignore
    }
  },

  updateItem: (item: DownloadItem) => {
    set((state) => {
      const existing = state.items.findIndex((i) => i.id === item.id);
      if (existing >= 0) {
        const updated = [...state.items];
        updated[existing] = item;
        return { items: updated };
      }
      return { items: [...state.items, item] };
    });
  },

  initListener: () => {
    const unlisten = onDownloadProgress((item) => {
      get().updateItem(item);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  },
}));
