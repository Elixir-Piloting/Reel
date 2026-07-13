import { create } from "zustand";
import type { VideoMeta, FormatInfo } from "../lib/tauri";

interface DownloadStore {
  url: string;
  metadata: VideoMeta | null;
  formats: FormatInfo[];
  selectedFormatId: string | null;
  filename: string;
  outputDir: string;
  downloadType: "VideoAudio" | "VideoOnly" | "AudioOnly";
  premiereMode: boolean;
  startTime: string;
  endTime: string;
  isAnalyzing: boolean;
  isFetchingFormats: boolean;
  error: string | null;

  setUrl: (url: string) => void;
  setMetadata: (meta: VideoMeta | null) => void;
  setFormats: (formats: FormatInfo[]) => void;
  setSelectedFormatId: (id: string | null) => void;
  setFilename: (name: string) => void;
  setOutputDir: (dir: string) => void;
  setDownloadType: (type: "VideoAudio" | "VideoOnly" | "AudioOnly") => void;
  setPremiereMode: (mode: boolean) => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  setIsAnalyzing: (v: boolean) => void;
  setIsFetchingFormats: (v: boolean) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  url: "",
  metadata: null,
  formats: [],
  selectedFormatId: null,
  filename: "",
  outputDir: "",
  downloadType: "VideoAudio",
  premiereMode: false,
  startTime: "",
  endTime: "",
  isAnalyzing: false,
  isFetchingFormats: false,
  error: null,

  setUrl: (url) => set({ url }),
  setMetadata: (meta) => set({ metadata: meta, filename: meta?.title ?? "" }),
  setFormats: (formats) => set({ formats }),
  setSelectedFormatId: (id) => set({ selectedFormatId: id }),
  setFilename: (name) => set({ filename: name }),
  setOutputDir: (dir) => set({ outputDir: dir }),
  setDownloadType: (type) => set({ downloadType: type }),
  setPremiereMode: (mode) => set({ premiereMode: mode }),
  setStartTime: (time) => set({ startTime: time }),
  setEndTime: (time) => set({ endTime: time }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setIsFetchingFormats: (v) => set({ isFetchingFormats: v }),
  setError: (err) => set({ error: err }),
  reset: () =>
    set({
      url: "",
      metadata: null,
      formats: [],
      selectedFormatId: null,
      filename: "",
      outputDir: "",
      downloadType: "VideoAudio",
      premiereMode: false,
      startTime: "",
      endTime: "",
      isAnalyzing: false,
      isFetchingFormats: false,
      error: null,
    }),
}));
