import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { VideoMeta, FormatInfo, DownloadItem, QualityOption, Preset, PlaylistEntry } from "../lib/tauri";
import {
  analyzeVideo,
  enqueueDownload,
  cancelDownload,
} from "../lib/tauri";
import { useSettingsStore } from "./settings-store";

const PRESETS_KEY = "ytmate-presets";

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function savePresets(presets: Preset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {}
}

function buildQualityOptions(formats: FormatInfo[], type: "audio-only" | "video+audio"): QualityOption[] {
  if (type === "audio-only") {
    return formats
      .filter((f) => f.video_codec === "None" && f.audio_codec !== "None")
      .map((f) => ({
        label: `${f.audio_codec} ${f.filesize ? `${(f.filesize / 1024 / 1024).toFixed(1)}MB` : ""}`.trim() || f.format_id,
        height: 0,
        formatId: f.format_id,
        hasAudio: true,
        fps: null,
        filesize: f.filesize,
      }));
  }

  const videoFormats = formats.filter((f) => f.video_codec !== "None");
  const groups = new Map<number, FormatInfo[]>();
  for (const f of videoFormats) {
    const h = parseInt(f.resolution.split("x")[1] ?? "0", 10);
    if (h <= 0) continue;
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h)!.push(f);
  }

  const sortedHeights = [...groups.keys()].sort((a, b) => b - a);
  const result: QualityOption[] = [];

  for (const h of sortedHeights) {
    const group = groups.get(h)!;
    const best = group.find((f) => f.audio_codec !== "None") || group[0];
    const label = h >= 1000 ? `${Math.round(h / 1000)}K` : `${h}p`;
    result.push({
      label,
      height: h,
      formatId: best.format_id,
      hasAudio: best.audio_codec !== "None",
      fps: best.fps,
      filesize: best.filesize,
    });
  }

  return result;
}

interface ProgressPayload {
  id: string;
  progress: number;
  speed: string;
  eta: string;
  status: string;
}

type Phase = "idle" | "analyzing" | "ready" | "playlist" | "downloading" | "completed" | "error";

export interface PlaylistItemProgress {
  index: number;
  title: string;
  status: "queued" | "downloading" | "completed" | "failed";
  progress: number;
  speed: string;
  eta: string;
}

interface DownloadStore {
  phase: Phase;
  url: string;
  metadata: VideoMeta | null;
  formats: FormatInfo[];
  qualityOptions: QualityOption[];
  error: string | null;

  // Playlist
  playlistEntries: PlaylistEntry[];
  selectedEntryIndices: Set<number>;
  selectAllPlaylist: boolean;

  // Single video options
  downloadType: "audio-only" | "video+audio";
  selectedQuality: string;
  startTime: number;
  endTime: number;
  encoding: string;
  premiereMode: boolean;

  filename: string;
  outputDir: string;

  // Presets
  presets: Preset[];
  selectedPresetId: string | null;

  // Download progress
  isDownloading: boolean;
  downloadProgress: number;
  downloadSpeed: string;
  downloadEta: string;
  downloadStatus: string;
  downloadItem: DownloadItem | null;
  completedFileName: string;
  playlistItemProgress: PlaylistItemProgress[];

  setUrl: (url: string) => void;
  analyzeUrl: () => Promise<void>;
  setError: (err: string | null) => void;

  setDownloadType: (t: "audio-only" | "video+audio") => void;
  setSelectedQuality: (q: string) => void;
  setStartTime: (s: number) => void;
  setEndTime: (s: number) => void;
  setEncoding: (e: string) => void;
  setPremiereMode: (m: boolean) => void;
  setFilename: (n: string) => void;
  setOutputDir: (d: string) => void;

  // Playlist
  toggleEntry: (index: number) => void;
  toggleSelectAll: () => void;

  // Presets
  addPreset: (name: string) => void;
  removePreset: (id: string) => void;
  selectPreset: (id: string | null) => void;

  // Download
  startDownload: () => Promise<void>;
  startPlaylistDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  reset: () => void;

  // Listeners
  initProgressListener: () => () => void;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: "premiere-pro",
    name: "Premiere Pro",
    downloadType: "video+audio",
    encoding: "mp4_h264",
    premiereMode: true,
  },
];

const existingPresets = loadPresets();
if (existingPresets.length === 0) {
  savePresets(DEFAULT_PRESETS);
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  phase: "idle",
  url: "",
  metadata: null,
  formats: [],
  qualityOptions: [],
  error: null,

  playlistEntries: [],
  selectedEntryIndices: new Set(),
  selectAllPlaylist: true,

  downloadType: "video+audio",
  selectedQuality: "",
  startTime: 0,
  endTime: 0,
  encoding: "mp4_h264",
  premiereMode: false,

  filename: "",
  outputDir: "",
  presets: existingPresets.length === 0 ? DEFAULT_PRESETS : existingPresets,
  selectedPresetId: null,

  isDownloading: false,
  downloadProgress: 0,
  downloadSpeed: "",
  downloadEta: "",
  downloadStatus: "",
  downloadItem: null,
  completedFileName: "",
  playlistItemProgress: [],

  setUrl: (url) => set({ url }),

  analyzeUrl: async () => {
    const { url } = get();
    if (!url.trim()) return;
    set({
      phase: "analyzing",
      metadata: null,
      formats: [],
      qualityOptions: [],
      playlistEntries: [],
      selectedEntryIndices: new Set(),
      error: null,
      startTime: 0,
      endTime: 0,
    });
    try {
      const res = await analyzeVideo(url.trim());

      if (res.is_playlist && res.playlist_entries && res.playlist_entries.length > 0) {
        const entries = res.playlist_entries;
        const allIndices = new Set(entries.map((_, i) => i));
        set({
          metadata: {
            title: res.playlist_title ?? "Playlist",
            duration: 0,
            channel: "",
            upload_date: "",
            thumbnail_url: "",
            webpage_url: url.trim(),
            is_playlist: true,
            playlist_title: res.playlist_title ?? null,
            playlist_id: null,
            playlist_count: entries.length,
          },
          playlistEntries: entries,
          selectedEntryIndices: allIndices,
          selectAllPlaylist: true,
          phase: "playlist",
        });
      } else if (res.video_meta && res.formats) {
        const meta = res.video_meta;
        const formats = res.formats;
        const options = buildQualityOptions(formats, get().downloadType);
        const settings = useSettingsStore.getState().settings;
        set({
          metadata: meta,
          formats,
          qualityOptions: options,
          phase: "ready",
          endTime: meta.duration,
          filename: meta.title,
          selectedQuality: options.length > 0 ? options[0].label : "",
          outputDir: settings.default_download_folder,
        });
      } else {
        throw new Error("Unexpected response from analyze_video");
      }
    } catch (err: unknown) {
      set({
        phase: "error",
        error: typeof err === "string" ? err : "Failed to analyze URL",
      });
    }
  },

  setError: (error) => set({ error, phase: error ? "error" : "idle" }),

  setDownloadType: (t) => {
    const { metadata, formats } = get();
    set({ downloadType: t, selectedQuality: "" });
    if (metadata && !metadata.is_playlist && formats.length > 0) {
      const options = buildQualityOptions(formats, t);
      set({ qualityOptions: options, selectedQuality: options.length > 0 ? options[0].label : "" });
    }
    const encodings = t === "audio-only"
      ? [{ value: "mp3", label: "MP3" }, { value: "m4a", label: "M4A (AAC)" }, { value: "opus", label: "Opus" }, { value: "flac", label: "FLAC" }, { value: "wav", label: "WAV" }]
      : [{ value: "mp4_h264", label: "MP4 (H.264)" }, { value: "mp4_h265", label: "MP4 (H.265/HEVC)" }, { value: "mkv", label: "MKV" }, { value: "webm", label: "WebM" }];
    set({ encoding: encodings[0].value });
  },

  setSelectedQuality: (q) => set({ selectedQuality: q }),
  setStartTime: (s) => set({ startTime: s }),
  setEndTime: (s) => set({ endTime: s }),
  setEncoding: (e) => set({ encoding: e }),
  setPremiereMode: (m) => set({ premiereMode: m }),
  setFilename: (n) => set({ filename: n }),
  setOutputDir: (d) => set({ outputDir: d }),

  toggleEntry: (index) => {
    const { selectedEntryIndices } = get();
    const next = new Set(selectedEntryIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    set({ selectedEntryIndices: next, selectAllPlaylist: next.size === get().playlistEntries.length });
  },

  toggleSelectAll: () => {
    const { selectAllPlaylist, playlistEntries } = get();
    if (selectAllPlaylist) {
      set({ selectedEntryIndices: new Set(), selectAllPlaylist: false });
    } else {
      set({ selectedEntryIndices: new Set(playlistEntries.map((_, i) => i)), selectAllPlaylist: true });
    }
  },

  addPreset: (name) => {
    const { downloadType, encoding, premiereMode, presets } = get();
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      downloadType,
      encoding,
      premiereMode,
    };
    const updated = [...presets, preset];
    savePresets(updated);
    set({ presets: updated, selectedPresetId: preset.id });
  },

  removePreset: (id) => {
    const { presets } = get();
    const updated = presets.filter((p) => p.id !== id);
    savePresets(updated);
    set({ presets: updated, selectedPresetId: null });
  },

  selectPreset: (id) => {
    if (!id) {
      set({ selectedPresetId: null });
      return;
    }
    const { presets } = get();
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    set({
      selectedPresetId: id,
      downloadType: preset.downloadType,
      encoding: preset.encoding,
      premiereMode: preset.premiereMode,
    });
  },

  startDownload: async () => {
    const state = get();
    const { url, metadata, qualityOptions, selectedQuality, downloadType, startTime, endTime, encoding, premiereMode, filename, outputDir } = state;
    if (!url.trim()) return;

    const settings = useSettingsStore.getState().settings;
    const dir = outputDir || settings.default_download_folder;
    if (!dir) return;

    const quality = qualityOptions.find((q) => q.label === selectedQuality);
    if (!quality) return;

    const formatId = quality.formatId;
    const dt: "Video" | "Audio" = downloadType === "audio-only" ? "Audio" : "Video";

    let actualEncoding = encoding;
    if (downloadType === "video+audio") {
      if (encoding === "mp4_h264") actualEncoding = "mp4";
      else if (encoding === "mp4_h265") actualEncoding = "mp4";
      else if (encoding === "mkv") actualEncoding = "mkv";
      else if (encoding === "webm") actualEncoding = "webm";
    }

    set({ phase: "downloading", isDownloading: true, downloadProgress: 0, downloadSpeed: "", downloadEta: "", downloadStatus: "Queued" });

    try {
      const item = await enqueueDownload({
        url,
        format_id: formatId,
        filename: (filename || metadata?.title || "video").replace(/[\\/:*?"<>|]/g, "_"),
        output_dir: dir,
        start_time: startTime > 0 ? String(Math.floor(startTime)) : null,
        end_time: endTime > 0 && endTime < (metadata?.duration || 0) ? String(Math.floor(endTime)) : null,
        premiere_mode: premiereMode,
        download_type: dt,
        video_title: metadata?.title || filename,
        thumbnail_url: metadata?.thumbnail_url || "",
        has_audio: quality.hasAudio,
        encoding: actualEncoding,
      });
      set({ downloadItem: item, completedFileName: item.filename });
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : "Download failed";
      set({ phase: "error", isDownloading: false, error: msg, downloadStatus: `Failed: ${msg}` });
    }
  },

  startPlaylistDownload: async () => {
    const state = get();
    const { metadata, playlistEntries, selectedEntryIndices, downloadType, selectedQuality, qualityOptions, encoding, premiereMode, outputDir, formats } = state;
    if (!metadata || !metadata.playlist_title) return;

    const settings = useSettingsStore.getState().settings;
    const baseDir = outputDir || settings.default_download_folder;
    if (!baseDir) return;

    const playlistFolderName = metadata.playlist_title.replace(/[\\/:*?"<>|]/g, "_");
    const dir = `${baseDir}\\${playlistFolderName}`;

    const dt: "Video" | "Audio" = downloadType === "audio-only" ? "Audio" : "Video";

    let actualEncoding = encoding;
    if (downloadType === "video+audio") {
      if (encoding === "mp4_h264") actualEncoding = "mp4";
      else if (encoding === "mp4_h265") actualEncoding = "mp4";
      else if (encoding === "mkv") actualEncoding = "mkv";
      else if (encoding === "webm") actualEncoding = "webm";
    }

    const selectedEntries = [...selectedEntryIndices].map((i) => playlistEntries[i]).filter(Boolean);
    const initProgress: PlaylistItemProgress[] = selectedEntries.map((entry) => ({
      index: entry.index,
      title: entry.title,
      status: "queued" as const,
      progress: 0,
      speed: "",
      eta: "",
    }));

    set({ phase: "downloading", isDownloading: true, downloadProgress: 0, downloadStatus: "Starting...", playlistItemProgress: initProgress });

    let formatId = "bestvideo+bestaudio/best";
    if (qualityOptions.length > 0) {
      const quality = qualityOptions.find((q) => q.label === selectedQuality);
      if (quality) formatId = quality.formatId;
    }

    const total = selectedEntries.length;
    let completed = 0;

    for (const [idx, entry] of selectedEntries.entries()) {
      if (!entry) continue;

      const updateItem = (patch: Partial<PlaylistItemProgress>) => {
        const cur = get().playlistItemProgress;
        const next = [...cur];
        next[idx] = { ...next[idx], ...patch };
        set({ playlistItemProgress: next });
      };

      try {
        updateItem({ status: "downloading" });
        set({ downloadStatus: `Downloading ${idx + 1}/${total}: ${entry.title}` });

        const item = await enqueueDownload({
          url: entry.url,
          format_id: formatId,
          filename: entry.title.replace(/[\\/:*?"<>|]/g, "_"),
          output_dir: dir,
          start_time: null,
          end_time: null,
          premiere_mode: premiereMode,
          download_type: dt,
          video_title: entry.title,
          thumbnail_url: entry.thumbnail,
          has_audio: downloadType === "video+audio",
          encoding: actualEncoding,
        });

        set({ downloadItem: item, completedFileName: item.filename });

        // Listen for progress updates
        const unsubProgress = await listen<{ id: string; progress: number; speed: string; eta: string; status: string }>("download-progress", (e) => {
          if (e.payload.id === item.id) {
            updateItem({ progress: e.payload.progress, speed: e.payload.speed, eta: e.payload.eta });
          }
        });

        // Wait for completion
        const unsubItem = await listen<DownloadItem>("download-item-update", (e) => {
          const st = typeof e.payload.status === "string" ? e.payload.status : "";
          if (e.payload.id === item.id && (st === "Completed" || st === "Failed" || st === "Cancelled")) {
            const isCompleted = st === "Completed";
            updateItem({ status: isCompleted ? "completed" : "failed", progress: isCompleted ? 100 : get().playlistItemProgress[idx].progress });
            if (isCompleted) completed++;
            set({ downloadProgress: Math.round((completed / total) * 100) });
          }
        });

        // Wait until this item finishes
        await new Promise<void>((resolve) => {
          const check = () => {
            const cur = get().playlistItemProgress[idx];
            if (cur.status === "completed" || cur.status === "failed") {
              unsubProgress();
              unsubItem();
              resolve();
            } else {
              setTimeout(check, 200);
            }
          };
          setTimeout(check, 200);
        });
      } catch {
        updateItem({ status: "failed" });
      }
    }

    set({ phase: "playlist", isDownloading: false, downloadProgress: 0, downloadStatus: "", downloadItem: null, completedFileName: "", playlistItemProgress: [] });
  },

  cancelDownload: async () => {
    const { downloadItem } = get();
    if (downloadItem) {
      await cancelDownload(downloadItem.id);
      set({ isDownloading: false, downloadStatus: "Cancelled", phase: "ready" });
    }
  },

  initProgressListener: () => {
    const unlisten1 = listen<DownloadItem>("download-item-update", (e) => {
      const payload = e.payload;
      const statusStr = typeof payload.status === "string" ? payload.status : Object.keys(payload.status as object)[0] || "Unknown";
      const isDone = ["Completed", "Failed", "Cancelled"].includes(statusStr);
      set({
        downloadItem: payload,
        downloadProgress: payload.progress,
        downloadStatus: statusStr,
        isDownloading: !isDone,
        phase: isDone ? (statusStr === "Completed" ? "completed" : "error") : "downloading",
        completedFileName: isDone ? payload.filename : get().completedFileName,
      });
    });

    const unlisten2 = listen<ProgressPayload>("download-progress", (e) => {
      const { progress, speed, eta, status } = e.payload;
      set({
        downloadProgress: progress,
        downloadSpeed: speed,
        downloadEta: eta,
        downloadStatus: status,
      });
    });

    return () => {
      unlisten1.then((fn) => fn());
      unlisten2.then((fn) => fn());
    };
  },

  reset: () =>
    set({
      phase: "idle",
      url: "",
      metadata: null,
      formats: [],
      qualityOptions: [],
      error: null,
      playlistEntries: [],
      selectedEntryIndices: new Set(),
      selectAllPlaylist: true,
      downloadType: "video+audio",
      selectedQuality: "",
      startTime: 0,
      endTime: 0,
      encoding: "mp4_h264",
      premiereMode: false,
      filename: "",
      outputDir: "",
      isDownloading: false,
      downloadProgress: 0,
      downloadSpeed: "",
      downloadEta: "",
      downloadStatus: "",
      downloadItem: null,
      completedFileName: "",
    }),
}));
