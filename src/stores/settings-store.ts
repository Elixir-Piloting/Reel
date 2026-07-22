import { create } from "zustand";
import type { AppSettings } from "../shared/lib/types";
import { dataService } from "../shared/lib/data-service";

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {
    default_download_folder: "",
    auto_update_ytdlp: false,
    auto_convert_premiere: false,
    show_all_formats: false,
    max_concurrent_downloads: 3,
  },
  loaded: false,

  loadSettings: async () => {
    try {
      const settings = await dataService.getSettings();
      set({ settings, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    await dataService.saveSettings(updated);
    set({ settings: updated });
  },
}));
