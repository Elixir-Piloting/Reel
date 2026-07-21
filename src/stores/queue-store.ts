import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { DownloadItem } from "../lib/tauri";
import { getQueue, removeFromQueue, enqueueDownload } from "../lib/tauri";
import { isItemActive, isItemFinished } from "../lib/utils";

interface ProgressPayload {
  id: string;
  progress: number;
  speed: string;
  eta: string;
  status: string;
}

interface QueueStore {
  items: DownloadItem[];
  loadQueue: () => Promise<void>;
  mergeProgress: (partial: ProgressPayload) => void;
  addItem: (item: DownloadItem) => void;
  removeItem: (id: string) => Promise<void>;
  retryItem: (id: string) => void;
  clearAllActive: () => Promise<void>;
  clearAllCompleted: () => Promise<void>;
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

  addItem: (item) => {
    console.log("[queue-store] addItem called", { id: item.id, title: item.title, status: item.status, queueSize: useQueueStore.getState().items.length });
    set((state) => {
      if (state.items.some((i) => i.id === item.id)) {
        console.warn("[queue-store] addItem skipped - duplicate id", item.id);
        return state;
      }
      const newItems = [...state.items, item];
      console.log("[queue-store] items updated", { newLength: newItems.length });
      return { items: newItems };
    });
  },

  mergeProgress: (partial) => {
    set((state) => {
      const idx = state.items.findIndex((i) => i.id === partial.id);
      if (idx < 0) return state;
      const updated = [...state.items];
      updated[idx] = { ...updated[idx], ...partial };
      return { items: updated };
    });
  },

  removeItem: async (id: string) => {
    try {
      await removeFromQueue(id);
      set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
    } catch {
      // ignore
    }
  },

  retryItem: (id: string) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const baseName = item.filename.includes(".")
      ? item.filename.slice(0, item.filename.lastIndexOf("."))
      : item.filename;
    enqueueDownload({
      url: item.url,
      format_id: item.format_id,
      filename: baseName,
      output_dir: item.output_path,
      start_time: null,
      end_time: null,
      premiere_mode: false,
      download_type: item.download_type === "Audio" ? "Audio" : "Video",
      video_title: item.title,
      thumbnail_url: item.thumbnail_url,
      has_audio: item.has_audio,
      encoding: "mp4_h264",
    }).catch(() => {});
  },

  clearAllActive: async () => {
    const active = get().items.filter((i) => isItemActive(i.status));
    for (const item of active) {
      await removeFromQueue(item.id);
    }
    set((state) => ({ items: state.items.filter((i) => !isItemActive(i.status)) }));
  },

  clearAllCompleted: async () => {
    const finished = get().items.filter((i) => isItemFinished(i.status));
    for (const item of finished) {
      await removeFromQueue(item.id);
    }
    set((state) => ({ items: state.items.filter((i) => !isItemFinished(i.status)) }));
  },

  initListener: () => {
    console.log("[queue-store] initListener called");
    const unlisten1 = listen<DownloadItem>("download-item-update", (e) => {
      console.log("[queue-store] received download-item-update event", { id: e.payload.id, status: e.payload.status, progress: e.payload.progress });
      set((state) => {
        const idx = state.items.findIndex((i) => i.id === e.payload.id);
        if (idx >= 0) {
          const updated = [...state.items];
          updated[idx] = e.payload;
          return { items: updated };
        }
        console.log("[queue-store] item not found in queue, adding new", e.payload.id);
        return { items: [...state.items, e.payload] };
      });
    });

    const unlisten2 = listen<ProgressPayload>("download-progress", (e) => {
      console.log("[queue-store] received download-progress event", { id: e.payload.id, progress: e.payload.progress, speed: e.payload.speed });
      get().mergeProgress(e.payload);
    });

    return () => {
      console.log("[queue-store] cleanup listeners");
      unlisten1.then((fn) => fn());
      unlisten2.then((fn) => fn());
    };
  },
}));
