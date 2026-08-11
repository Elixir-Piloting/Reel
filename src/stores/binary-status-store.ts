import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { dataService } from "@/shared/lib/data-service";
import type { BinaryStatus, ToolStatus } from "@/shared/lib/types";

const EMPTY: ToolStatus = { installed: null, latest: null, state: "missing" };

interface BinaryStatusStore {
  status: BinaryStatus;
  refresh: () => Promise<void>;
}

export const useBinaryStatusStore = create<BinaryStatusStore>((set) => ({
  status: { ytdlp: EMPTY, ffmpeg: EMPTY },
  refresh: async () => {
    try {
      const status = await dataService.binaryStatus();
      set({ status });
    } catch {
      // keep whatever we had
    }
  },
}));

listen<BinaryStatus>("binary-status", (e) => {
  useBinaryStatusStore.setState({ status: e.payload });
});