# YTMate Full Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform YTMate from a scaffolding prototype into a polished, opinionated desktop app with proper architecture, visual design, and robust UX.

**Architecture:** Extract the 580-line Zustand god store into domain slices, reorganize into feature-based folder structure, build a Rust `AppError` enum, add logger/deferred/encoding-config shared utilities, then layer on visual polish (Geist font, type scale, elevation tokens, animations), UX improvements (stable layout, toast notifications, URL history), performance (selective subscriptions, virtualized playlist), and new features (settings page, download history).

**Tech Stack:** Tauri v2, React 19, TypeScript 5.6, Zustand 5, Tailwind CSS v4, shadcn/ui (base-nova), @fontsource-variable/geist, sonner, Rust (tokio, serde, thiserror)

---

## Phase 1: Foundation — Shared Utilities & Dead Code Removal

No external behavior change. Install dependencies, remove dead code, create shared abstractions.

### Task 1.1: Remove dead shadcn UI components

**Files:**
- Delete: `src/components/ui/avatar.tsx`
- Delete: `src/components/ui/badge.tsx`
- Delete: `src/components/ui/breadcrumb.tsx`
- Delete: `src/components/ui/card.tsx`
- Delete: `src/components/ui/chart.tsx`
- Delete: `src/components/ui/checkbox.tsx`
- Delete: `src/components/ui/drawer.tsx`
- Delete: `src/components/ui/dropdown-menu.tsx`
- Delete: `src/components/ui/scroll-area.tsx`
- Delete: `src/components/ui/separator.tsx`
- Delete: `src/components/ui/sheet.tsx`
- Delete: `src/components/ui/sidebar.tsx`
- Delete: `src/components/ui/switch.tsx`
- Delete: `src/components/ui/table.tsx`
- Delete: `src/components/ui/tabs.tsx`
- Delete: `src/components/ui/toggle.tsx`
- Delete: `src/components/ui/toggle-group.tsx`
- Delete: `src/components/ui/tooltip.tsx`

- [ ] **Remove each dead file** — delete all 18 unused shadcn components listed above.
- [ ] **Verify build** — run `npx tsc --noEmit` and `npx vite build` to ensure no import breaks.

### Task 1.2: Remove template assets and empty directories

**Files:**
- Delete: `src/assets/tauri.svg`, `src/assets/typescript.svg`, `src/assets/vite.svg`
- Delete: `src/hooks/use-mobile.ts`
- Delete: `src/components/layout/`, `src/components/queue/`, `src/components/settings/` (empty dirs)

- [ ] **Delete assets** — remove all template SVGs and the dead hook.
- [ ] **Remove empty dirs** — delete the three empty component directories.
- [ ] **Verify build** — `npx tsc --noEmit` passes with no import errors.

### Task 1.3: Create shared utilities

**Files:**
- Create: `src/shared/lib/logger.ts`
- Create: `src/shared/lib/deferred.ts`
- Create: `src/shared/lib/encoding-config.ts`

**Details:**
- `src/shared/lib/logger.ts`: A simple logger with `debug/info/warn/error` methods. In dev mode uses `console` with timestamp prefixes. Production mode no-ops or can write to a Tauri command.
- `src/shared/lib/deferred.ts`: Wraps `Promise.withResolvers()` or a manual polyfill.
- `src/shared/lib/encoding-config.ts`: Single source of truth for video/audio encoding options. Exports `encodingConfig` with `video[]` and `audio[]` arrays containing `{ key, label, ext, mergeFormat?, audioFormat?, embedThumbnail? }`.

```typescript
// src/shared/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  if (!isDev && level === 'debug') return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta) fn(`${prefix} ${msg}`, meta);
  else fn(`${prefix} ${msg}`);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
```

```typescript
// src/shared/lib/deferred.ts
export class Deferred<T = void> {
  promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}
```

```typescript
// src/shared/lib/encoding-config.ts
export interface VideoEncoding {
  key: string;
  label: string;
  ext: string;
  mergeFormat: string;
}

export interface AudioEncoding {
  key: string;
  label: string;
  ext: string;
  audioFormat: string;
  embedThumbnail: boolean;
}

export const encodingConfig = {
  video: [
    { key: 'mp4_h264', label: 'MP4 (H.264)', ext: 'mp4', mergeFormat: 'mp4' },
    { key: 'mp4_h265', label: 'MP4 (H.265/HEVC)', ext: 'mp4', mergeFormat: 'mp4' },
    { key: 'mkv', label: 'MKV', ext: 'mkv', mergeFormat: 'mkv' },
    { key: 'webm', label: 'WebM', ext: 'webm', mergeFormat: 'webm' },
  ],
  audio: [
    { key: 'mp3', label: 'MP3', ext: 'mp3', audioFormat: 'mp3', embedThumbnail: true },
    { key: 'm4a', label: 'M4A (AAC)', ext: 'm4a', audioFormat: 'aac', embedThumbnail: true },
    { key: 'flac', label: 'FLAC', ext: 'flac', audioFormat: 'flac', embedThumbnail: false },
    { key: 'opus', label: 'Opus', ext: 'opus', audioFormat: 'opus', embedThumbnail: false },
    { key: 'wav', label: 'WAV', ext: 'wav', audioFormat: 'wav', embedThumbnail: false },
  ],
} as const;

export type VideoEncodingKey = (typeof encodingConfig.video)[number]['key'];
export type AudioEncodingKey = (typeof encodingConfig.audio)[number]['key'];
```

- [ ] **Create logger.ts** — write the logger utility.
- [ ] **Create deferred.ts** — write the Deferred class.
- [ ] **Create encoding-config.ts** — write the encoding config with all video/audio options.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

### Task 1.4: Remove unused npm dependencies

**Files:**
- Modify: `package.json` — remove unused deps

Unused deps to remove: `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@tanstack/react-table`, `next-themes`, `recharts`, `tailwindcss-animate`, `tw-animate-css`, `zod`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`.

- [ ] **Remove unused packages** from `package.json` dependencies.
- [ ] **Run `npm install`** to update lockfile.
- [ ] **Verify build** — `npx tsc --noEmit` and `npx vite build` pass.

---

## Phase 2: State Management Split

Split the 580-line `download-store.ts` into five focused stores: analysis, download-options, download-execution, playlist, presets.

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

### Task 2.2: Create `useDownloadOptionsStore`

**Files:**
- Create: `src/stores/options-store.ts`

Extracts from `download-store.ts`: `downloadType`, `selectedQuality`, `startTime`, `endTime`, `encoding`, `premiereMode`, `filename`, `outputDir`, and their setters.

```typescript
import { create } from 'zustand';

type DownloadType = 'video' | 'audio';

interface OptionsState {
  downloadType: DownloadType;
  selectedQuality: string;
  startTime: number;
  endTime: number;
  encoding: string;
  premiereMode: boolean;
  filename: string;
  outputDir: string;

  setDownloadType: (t: DownloadType) => void;
  setSelectedQuality: (q: string) => void;
  setStartTime: (t: number) => void;
  setEndTime: (t: number) => void;
  setEncoding: (e: string) => void;
  setPremiereMode: (p: boolean) => void;
  setFilename: (f: string) => void;
  setOutputDir: (d: string) => void;
  resetOptions: () => void;
}

const initialState = {
  downloadType: 'video' as DownloadType,
  selectedQuality: '',
  startTime: 0,
  endTime: 0,
  encoding: 'mp4_h264',
  premiereMode: false,
  filename: '',
  outputDir: '',
};

export const useOptionsStore = create<OptionsState>((set) => ({
  ...initialState,

  setDownloadType: (downloadType) => set({ downloadType }),
  setSelectedQuality: (selectedQuality) => set({ selectedQuality }),
  setStartTime: (startTime) => set({ startTime }),
  setEndTime: (endTime) => set({ endTime }),
  setEncoding: (encoding) => set({ encoding }),
  setPremiereMode: (premiereMode) => set({ premiereMode }),
  setFilename: (filename) => set({ filename }),
  setOutputDir: (outputDir) => set({ outputDir }),
  resetOptions: () => set(initialState),
}));
```

- [ ] **Create `options-store.ts`** with the implementation above.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

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

### Task 2.4: Create `useDownloadExecutionStore`

**Files:**
- Create: `src/stores/download-execution-store.ts`

Extracts from `download-store.ts`: `isDownloading`, `downloadProgress`, `downloadSpeed`, `downloadEta`, `downloadStatus`, `downloadItem`, `completedFileName`, `playlistItemProgress`, `phase` (downloading/completed parts), and actions `startDownload`, `cancelDownload`, `reset`, `initProgressListener`.

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '../shared/lib/logger';

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: string;
  progress: number;
  speed: string;
  eta: string;
  output_path: string;
  filename: string;
}

interface DownloadExecutionState {
  isDownloading: boolean;
  downloadProgress: number;
  downloadSpeed: string;
  downloadEta: string;
  downloadStatus: string;
  downloadItem: DownloadItem | null;
  completedFileName: string | null;

  setDownloading: (v: boolean) => void;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  reset: () => void;
  initProgressListener: () => Promise<() => void>;
}

export const useDownloadExecutionStore = create<DownloadExecutionState>((set, get) => ({
  isDownloading: false,
  downloadProgress: 0,
  downloadSpeed: '',
  downloadEta: '',
  downloadStatus: '',
  downloadItem: null,
  completedFileName: null,

  setDownloading: (v) => set({ isDownloading: v }),

  startDownload: async () => {
    // Will be wired up in Phase 5 with the hook pattern
  },

  cancelDownload: async () => {
    const item = get().downloadItem;
    if (!item) return;
    try {
      await invoke('cancel_download', { id: item.id });
      set({ isDownloading: false, phase: 'ready' });
    } catch (e) {
      logger.error('Failed to cancel download', { error: e });
    }
  },

  reset: () => set({
    isDownloading: false,
    downloadProgress: 0,
    downloadSpeed: '',
    downloadEta: '',
    downloadStatus: '',
    downloadItem: null,
    completedFileName: null,
  }),

  initProgressListener: async () => {
    const unlistenProgress = await listen<{ id: string; progress: number; speed: string; eta: string; status: string }>(
      'download-progress',
      (event) => {
        set({
          downloadProgress: event.payload.progress,
          downloadSpeed: event.payload.speed,
          downloadEta: event.payload.eta,
          downloadStatus: event.payload.status,
        });
      },
    );
    const unlistenItem = await listen<DownloadItem>('download-item-update', (event) => {
      set({ downloadItem: event.payload });
    });
    return () => {
      unlistenProgress();
      unlistenItem();
    };
  },
}));
```

- [ ] **Create `download-execution-store.ts`** with stubs for `startDownload` (will fill in Phase 5).
- [ ] **Verify build** — `npx tsc --noEmit` passes.

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

### Task 2.6: Remove old `download-store.ts` and update imports

**Files:**
- Delete: `src/stores/download-store.ts`
- Modify: all component files to import from new stores

- [ ] **Delete `download-store.ts`** — remove the god store.
- [ ] **Update imports** across all components to use the new focused stores.
- [ ] **Verify build** — `npx tsc --noEmit` passes with no missing exports.

---

## Phase 3: Architecture Reorganization

Move code into feature-based folder structure following the target layout from megaprompt §13.

### Task 3.1: Create feature folder structure

**Files to create (all under `src/features/`):**

```
src/features/
  url-input/
    UrlInput.tsx
    index.ts
  video-info/
    VideoInfo.tsx
    VideoInfoSkeleton.tsx
    index.ts
  download-options/
    DownloadOptionsPanel.tsx
    DownloadTypeToggle.tsx
    QualitySelector.tsx
    RangeSelector.tsx
    EncodingSelector.tsx
    DestinationFolder.tsx
    FilenamePreview.tsx
    index.ts
  download-execution/
    DownloadProgressCard.tsx
    CancelButton.tsx
    OpenInExplorerButton.tsx
    RetryButton.tsx
    index.ts
  playlist/
    PlaylistSelector.tsx
    PlaylistItem.tsx
    PlaylistStatusIcon.tsx
    PlaylistBatchProgress.tsx
    PlaylistOptions.tsx
    index.ts
  presets/
    PresetSelector.tsx
    PresetSaveDialog.tsx
    PresetList.tsx
    index.ts
  download-history/
    HistoryPanel.tsx
    HistoryItem.tsx
    HistoryEmptyState.tsx
    index.ts
  settings/
    SettingsPage.tsx
    index.ts
  notifications/
    NotificationCenter.tsx
    NotificationToast.tsx
    notificationService.ts
    index.ts
```

Move existing components into the appropriate feature folders. Each `index.ts` exports the feature's public API.

- [ ] **Create feature directories** — all directories listed above.
- [ ] **Move components** — relocate each existing component to its feature folder with appropriate splitting.
- [ ] **Create index.ts exports** — each feature folder gets an `index.ts`.
- [ ] **Delete old `src/components/download/`** folder.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

### Task 3.2: Create `DataService` and `tauri.ts` refactor

**Files:**
- Create: `src/shared/lib/data-service.ts`
- Modify: remove old `src/lib/tauri.ts` (move types to a types file)

```typescript
// src/shared/lib/data-service.ts
import { invoke } from '@tauri-apps/api/core';
import type { AnalyzeResponse, DownloadItem, AppSettings } from './types';

class DataService {
  async analyzeVideo(url: string): Promise<AnalyzeResponse> {
    return invoke<AnalyzeResponse>('analyze_video', { url });
  }

  async enqueueDownload(req: DownloadRequest): Promise<DownloadItem> {
    return invoke<DownloadItem>('enqueue_download', { request: req });
  }

  async cancelDownload(id: string): Promise<boolean> {
    return invoke<boolean>('cancel_download', { id });
  }

  async getQueue(): Promise<DownloadItem[]> {
    return invoke<DownloadItem[]>('get_queue');
  }

  async removeFromQueue(id: string): Promise<boolean> {
    return invoke<boolean>('remove_from_queue', { id });
  }

  async openInExplorer(path: string): Promise<void> {
    return invoke<void>('open_in_explorer', { path });
  }

  async browseFolder(): Promise<string | null> {
    return invoke<string | null>('browse_folder');
  }

  async getSettings(): Promise<AppSettings> {
    return invoke<AppSettings>('get_settings');
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    return invoke<void>('save_settings', { settings });
  }

  async updateYtdlp(): Promise<string> {
    return invoke<string>('update_ytdlp');
  }
}

export const dataService = new DataService();
```

- [ ] **Create `data-service.ts`** with the full DataService class.
- [ ] **Move type definitions** from `src/lib/tauri.ts` to `src/shared/lib/types.ts`.
- [ ] **Update all invoke calls** in the app to use `dataService` instead of raw `invoke`.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

---

## Phase 4: Rust Backend Cleanup

### Task 4.1: Create `AppError` enum

**Files:**
- Create: `src-tauri/src/error.rs`

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("yt-dlp sidecar not found: {0}")]
    SidecarNotFound(String),
    #[error("yt-dlp returned an error: {0}")]
    YtDlpError(String),
    #[error("Download failed after {0} attempts: {1}")]
    DownloadFailed(u32, String),
    #[error("FFmpeg error: {0}")]
    FfmpegError(String),
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("Storage error: {0}")]
    StorageError(String),
    #[error("Cancelled")]
    Cancelled,
}
```

- [ ] **Create `error.rs`** with the AppError enum.
- [ ] **Modify `lib.rs`** to register the module: `mod error;`
- [ ] **Update command signatures** to return `Result<_, AppError>` instead of `Result<_, String>`.

### Task 4.2: Startup queue cleanup

**Files:**
- Modify: `src-tauri/src/lib.rs` — in `setup`/`load_saved_queue`, mark in-flight items as failed

In `load_saved_queue`, iterate persisted queue items. Any item with status `"Downloading"` or `"Queued"` should be marked as `Failed("App was closed")`.

- [ ] **Implement startup cleanup** — mark orphaned items as failed.
- [ ] **Verify `cargo check`** passes.

### Task 4.3: Structured logging

**Files:**
- Create: `src-tauri/src/logging.rs`

Set up `tracing` or `log` crate with file-based logging. Write logs to `app_data_dir/ytmate.log` with rotation.

- [ ] **Create `logging.rs`** with log setup.
- [ ] **Replace `eprintln!` calls** with structured logging in `download.rs` and other commands.

---

## Phase 5: UX and Interaction Improvements

### Task 5.1: Stabilize layout — remove phase-gate pattern

**Files:**
- Modify: `src/pages/DownloadPage.tsx` — rewrite as stable layout with `UrlInput` always mounted

Replace the if-else phase tree with a layout where:
- `UrlInput` is always at the top
- Content sections mount/unmount with animation wrappers (CSS animate + `display: none`)
- Phase logic controls visibility, not mounting

```typescript
function DownloadPage() {
  const phase = useAnalysisStore((s) => s.phase);
  // ...
  return (
    <div className="...">
      <UrlInput />
      <AnimatePresence>
        {phase === 'analyzing' && <VideoInfoSkeleton />}
        {phase === 'ready' && <DownloadOptionsPanel />}
        {phase === 'playlist' && <PlaylistSelector />}
        {(phase === 'downloading' || phase === 'completed') && <DownloadProgressCard />}
        {phase === 'error' && <ErrorBanner />}
      </AnimatePresence>
    </div>
  );
}
```

Wrapper `AnimatePresence` is a CSS animation container (not Framer Motion — use CSS transitions with `animate-fadeIn`/`animate-fadeOut` to avoid adding the dependency):

```typescript
function AnimatePresence({ children }: { children: React.ReactNode }) {
  return <div className="transition-all duration-300 ease-out">{children}</div>;
}
```

- [ ] **Rewrite `DownloadPage.tsx`** with stable layout + CSS animations.
- [ ] **Remove phase-if-else-tree** — UrlInput always mounted.
- [ ] **Verify build** — app no longer unmounts/remounts elements on phase change.

### Task 5.2: Fix paste/analyze race condition

**Files:**
- Modify: `src/features/url-input/UrlInput.tsx`

Change `analyzeUrl` to accept an optional URL parameter. On paste, pass URL directly:

```typescript
const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      setUrl(text);
      await analyzeUrl(text); // Pass URL directly
    }
  } catch { logger.warn('Clipboard read failed'); }
};
```

- [ ] **Update `analyzeUrl` in analysis-store** to accept optional URL param.
- [ ] **Update `UrlInput.tsx`** to pass URL directly, removing `setTimeout` hack.
- [ ] **Verify** paste works without the 50ms timeout.

### Task 5.3: Add toast notifications

**Files:**
- Modify: `src/features/notifications/notificationService.ts` — create notification service
- Modify: `src/App.tsx` — ensure `<Toaster />` is present

Add sonner toast calls at key state transitions:
- Analysis complete (single video)
- Analysis complete (playlist, N items)
- Download started
- Download complete (with "Open in Explorer" action)
- Download failed (with "Retry" action)

```typescript
// src/features/notifications/notificationService.ts
import { toast } from 'sonner';

export const notify = {
  analysisComplete: (title: string) => toast.success('Analysis complete', { description: title }),
  playlistFound: (count: number) => toast.info(`Playlist found`, { description: `${count} items ready to download` }),
  downloadStarted: (title: string) => toast.loading('Download started', { description: title, id: 'download' }),
  downloadComplete: (title: string, onOpen: () => void) =>
    toast.success('Download complete', { description: title, action: { label: 'Open', onClick: onOpen } }),
  downloadFailed: (title: string, error: string, onRetry: () => void) =>
    toast.error('Download failed', { description: error, action: { label: 'Retry', onClick: onRetry } }),
};
```

- [ ] **Create `notificationService.ts`** with toast notification functions.
- [ ] **Wire notifications** into download start/complete/fail flows in the store/hooks.
- [ ] **Verify** toasts appear at each state transition.

### Task 5.4: Replace polling with deferred pattern

**Files:**
- Modify: `src/features/playlist/` — replace `setTimeout(check, 200)` polling

In `startPlaylistDownload` or the `usePlaylistDownload` hook, replace the polling loop:

```typescript
import { Deferred } from '../../shared/lib/deferred';
import { listen } from '@tauri-apps/api/event';

// For each playlist item:
const deferred = new Deferred<void>();
const unsub = await listen<DownloadItem>('download-item-update', (e) => {
  if (e.payload.id === itemId && ['completed', 'failed', 'cancelled'].includes(e.payload.status)) {
    deferred.resolve();
  }
});
await deferred.promise;
unsub();
```

- [ ] **Replace polling** — use Deferred + Tauri events in playlist download loop.
- [ ] **Verify** playlist downloads complete without polling.

### Task 5.5: Add URL history

**Files:**
- Create: `src/features/url-input/useUrlHistory.ts`

```typescript
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ytmate-url-history';
const MAX_HISTORY = 20;

export interface UrlHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
}

export function useUrlHistory() {
  const [history, setHistory] = useState<UrlHistoryEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  });

  const addEntry = useCallback((url: string, title: string) => {
    setHistory((prev) => {
      const filtered = prev.filter((e) => e.url !== url);
      const next = [{ url, title, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { history, addEntry };
}
```

- [ ] **Create `useUrlHistory.ts`** hook.
- [ ] **Wire into `UrlInput`** — show recent URLs as a dropdown when input is focused.
- [ ] **Verify** URL history persists across page refreshes.

### Task 5.6: Zero-duration / live stream handling

**Files:**
- Modify: `src/features/download-options/RangeSelector.tsx`

Fix `pct()` to handle `maxTime === 0`:

```typescript
const pct = (v: number) => (maxTime > 0 ? (v / maxTime) * 100 : 0);
```

Hide the RangeSelector when `duration === 0` and show "Live stream — full duration will be downloaded".

- [ ] **Fix `pct()`** and add live stream guard.
- [ ] **Verify** no NaN values appear for zero-duration videos.

---

## Phase 6: Visual Design Overhaul

### Task 6.1: Import and configure Geist font

**Files:**
- Modify: `src/main.tsx` — add `import '@fontsource-variable/geist';`
- Modify: `src/styles.css` — update `--font-sans` to use Geist

```typescript
// main.tsx
import '@fontsource-variable/geist';
```

```css
/* styles.css */
:root {
  --font-sans: 'Geist', sans-serif;
  /* Remove Poppins, Libre Baskerville, IBM Plex Mono declarations */
}
```

- [ ] **Import Geist** in `main.tsx`.
- [ ] **Update CSS** — set `--font-sans` to Geist, clean up unused font declarations.

### Task 6.2: Define type scale

**Files:**
- Modify: `src/styles.css` — add type scale custom properties

```css
:root {
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-lg: 1.0625rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
  --text-display: 2.5rem;
  --text-heading: 1.25rem;
  --text-body: 0.9375rem;
  --text-caption: 0.8125rem;
  --text-label: 0.8125rem;
  --leading-tight: 1.15;
  --leading-normal: 1.5;
  --tracking-tight: -0.01em;
}
```

Map into `@theme inline` so Tailwind picks them up.

- [ ] **Add type scale** to `styles.css`.
- [ ] **Apply type scale** — update component text classes to use new scale tokens.

### Task 6.3: Add surface elevation and shadow tokens

**Files:**
- Modify: `src/styles.css`

```css
:root {
  --surface-elevated: oklch(0.97 0.005 70);
  --surface-overlay: oklch(0.96 0.005 70);
  --surface-sunken: oklch(0.99 0.003 70);

  --shadow-card: 0 1px 3px oklch(0 0 0 / 0.08), 0 1px 2px oklch(0 0 0 / 0.06);
  --shadow-dropdown: 0 4px 6px oklch(0 0 0 / 0.1), 0 2px 4px oklch(0 0 0 / 0.06);
  --shadow-modal: 0 10px 15px oklch(0 0 0 / 0.15), 0 4px 6px oklch(0 0 0 / 0.1);
}

.dark {
  --surface-elevated: oklch(0.2 0.005 30);
  --surface-overlay: oklch(0.23 0.005 30);
  --surface-sunken: oklch(0.14 0.003 30);

  --shadow-card: 0 1px 3px oklch(0 0 0 / 0.3);
  --shadow-dropdown: 0 4px 6px oklch(0 0 0 / 0.4);
  --shadow-modal: 0 10px 15px oklch(0 0 0 / 0.5);
}
```

- [ ] **Add elevation/surface tokens** — background, card, input surfaces visually distinct.
- [ ] **Apply to components** — cards get `bg-elevated`, inputs get `bg-sunken`, etc.

### Task 6.4: Polish the header

**Files:**
- Modify: `src/App.tsx` — redesign header with backdrop blur, cohesive theme toggle

```typescript
<header className="sticky top-0 z-50 h-14 border-b border-border/40 bg-background/80 backdrop-blur-md px-6 flex items-center justify-between">
  <h1 className="text-heading font-semibold tracking-tight">YTMate</h1>
  <ThemeToggle />
</header>
```

The theme toggle becomes a cohesive group (3 buttons with active indicator).

- [ ] **Redesign header** — backdrop blur, cohesive theme toggle.
- [ ] **Verify** header looks polished in both themes.

### Task 6.5: Group settings into surfaced cards

**Files:**
- Modify: `src/features/download-options/DownloadOptionsPanel.tsx`

Each section (VideoInfo, DownloadType, Quality, Range, Encoding, Preset, Destination) is now a card with `bg-elevated`, `shadow-card`, rounded corners, and consistent padding.

```typescript
function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-elevated shadow-card rounded-lg p-4 space-y-3">
      <h2 className="text-heading font-medium">{title}</h2>
      {children}
    </div>
  );
}
```

- [ ] **Create `SettingsCard`** wrapper component.
- [ ] **Wrap each section** — VideoInfo, DownloadType, Quality, Range, Encoding, Preset, Destination each in a SettingsCard.

### Task 6.6: Add animations

**Files:**
- Modify: `src/styles.css` — add animation keyframes

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fade-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-4px); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes scale-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.97); }
  100% { transform: scale(1); }
}

.animate-fade-in { animation: fade-in 0.25s ease-out; }
.animate-fade-out { animation: fade-out 0.2s ease-in; }
.animate-shimmer {
  background: linear-gradient(90deg, transparent, oklch(1 0 0 / 0.1), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.animate-scale-press:active { transform: scale(0.97); transition: transform 0.1s; }
```

Add progress bar shimmer effect and button press states.

- [ ] **Add CSS animations** to `styles.css`.
- [ ] **Apply animations** — phase transitions, progress bar shimmer, button press.
- [ ] **Verify** all transitions are smooth and not jarring.

### Task 6.7: Replace RangeSelector with accessible slider

**Files:**
- Modify: `src/features/download-options/RangeSelector.tsx`

Replace the hand-rolled mouse-event slider with `@base-ui/react/slider` (already installed).

```typescript
import { Slider } from '@base-ui/react/slider';

function RangeSelector({ maxTime }: { maxTime: number }) {
  if (maxTime <= 0) return <p className="text-caption text-muted">Live stream — full duration will be downloaded</p>;

  return (
    <div>
      <Slider.Root min={0} max={maxTime} step={1} value={[startTime, endTime]} onValueChange={...}>
        <Slider.Track className="...">
          <Slider.Indicator className="..." />
          <Slider.Thumb className="..." />
          <Slider.Thumb className="..." />
        </Slider.Track>
      </Slider.Root>
    </div>
  );
}
```

- [ ] **Replace RangeSelector** with @base-ui/react/slider implementation.
- [ ] **Add keyboard accessibility** — ARIA attributes, focus styling.
- [ ] **Remove old mouse-event listeners** and window event listeners.

### Task 6.8: Replace native checkbox in PlaylistSelector

**Files:**
- Modify: `src/features/playlist/PlaylistSelector.tsx`

Replace `<input type="checkbox">` with a styled checkbox component. Since we deleted the shadcn checkbox, create a simple one:

```typescript
function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded border ${checked ? 'bg-primary border-primary' : 'border-muted'} flex items-center justify-center transition-colors`}
    >
      {checked && <Check size={12} className="text-primary-foreground" />}
    </button>
  );
}
```

- [ ] **Replace native checkbox** with styled component.
- [ ] **Verify** keyboard accessibility (Tab + Space to toggle).

---

## Phase 7: Performance and Robustness

### Task 7.1: Narrow Zustand selectors

**Files:**
- Modify: All component files using `useStore()` — replace full-store subscriptions with narrow selectors

Before:
```typescript
const { downloadProgress, downloadSpeed, downloadEta } = useDownloadExecutionStore();
```

After:
```typescript
const downloadProgress = useDownloadExecutionStore((s) => s.downloadProgress);
const downloadSpeed = useDownloadExecutionStore((s) => s.downloadSpeed);
const downloadEta = useDownloadExecutionStore((s) => s.downloadEta);
```

- [ ] **Refactor all components** — narrow selectors in every component that uses Zustand stores.
- [ ] **Verify** no full-store destructuring patterns remain.

### Task 7.2: Virtualize playlist list

**Files:**
- Modify: `src/features/playlist/PlaylistSelector.tsx`

Install `@tanstack/react-virtual` if not already available, then virtualize the playlist list:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: entries.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60,
});
```

Wrap entries in `<div style={{ height: virtualizer.getTotalSize() }}>` with absolute-positioned virtual rows.

- [ ] **Add virtualization** — only render visible playlist items.
- [ ] **Verify** a 500-entry playlist doesn't freeze the UI.

### Task 7.3: Throttle progress events (Rust side)

**Files:**
- Modify: `src-tauri/src/commands/download.rs` — add throttling to `emit_progress`

```rust
use std::time::Instant;
use std::collections::HashMap;

// In process_download, maintain a throttling cache
let mut last_emit: HashMap<String, Instant> = HashMap::new();
let mut last_pct: HashMap<String, f64> = HashMap::new();

// In the progress emission loop:
let now = Instant::now();
let should_emit = last_emit.get(&id)
    .map(|last| now.duration_since(*last) >= Duration::from_millis(100))
    .unwrap_or(true)
    || (progress_pct - last_pct.get(&id).copied().unwrap_or(0.0)).abs() >= 1.0;

if should_emit {
    last_emit.insert(id.clone(), now);
    last_pct.insert(id.clone(), progress_pct);
    emit_progress(&app, &id, progress_pct, &speed, &eta, &status);
}
```

- [ ] **Add throttling** to `emit_progress` — max ~10 events/sec.
- [ ] **Verify** via logging that event count is reduced.

### Task 7.4: Frontend rAF batching

**Files:**
- Modify: `src/stores/download-execution-store.ts` — batch progress updates via rAF

```typescript
let rafId: number | null = null;
let pendingUpdate: Partial<DownloadExecutionState> | null = null;

const scheduleBatch = (update: Partial<DownloadExecutionState>) => {
  pendingUpdate = { ...pendingUpdate, ...update };
  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      set(pendingUpdate!);
      pendingUpdate = null;
      rafId = null;
    });
  }
};
```

Use `scheduleBatch` in the progress listener instead of direct `set()`.

- [ ] **Add rAF batching** in the store progress handler.
- [ ] **Verify** React re-renders are reduced during active downloads.

### Task 7.5: Add parallel playlist downloads

**Files:**
- Modify: `src-tauri/src/commands/download.rs` — add semaphore for concurrent downloads

Use `tokio::sync::Semaphore` with configurable max permits (default 2). Wrap each `process_download` call with `semaphore.acquire()`.

- [ ] **Add concurrency limit** in Rust download processing.
- [ ] **Wire frontend setting** to the concurrency parameter.

### Task 7.6: Disk space check and post-download verification

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

Before spawning yt-dlp, check available disk space. After download completes, verify the output file exists and has non-zero size.

```rust
use std::path::Path;
use fs2::available_space;

fn check_disk_space(output_path: &Path, estimated_size: u64) -> Result<(), AppError> {
    let available = available_space(output_path).map_err(|e| AppError::StorageError(e.to_string()))?;
    if estimated_size > available {
        return Err(AppError::StorageError(format!(
            "Insufficient disk space. Need ~{}MB, have {}MB available",
            estimated_size / 1024 / 1024,
            available / 1024 / 1024,
        )));
    }
    Ok(())
}

fn verify_output(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Err(AppError::StorageError("Output file not found after download".into()));
    }
    if path.metadata()?.len() == 0 {
        return Err(AppError::StorageError("Output file is empty".into()));
    }
    Ok(())
}
```

- [ ] **Add disk space check** before download.
- [ ] **Add post-download verification** — file exists and non-zero size.

---

## Phase 8: Settings and History

### Task 8.1: Build Settings page

**Files:**
- Create: `src/features/settings/SettingsPage.tsx`

Settings controls:
- Default download folder (browse + path display)
- Auto-update yt-dlp on launch (toggle)
- Auto-convert to Premiere-compatible (toggle)
- Show all formats (toggle)
- Concurrency limit (number input, 1-5)
- Default encoding per type (select)
- Output filename pattern (text input with placeholders)

```typescript
function SettingsPage() {
  const { settings, updateSettings } = useSettingsStore();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <SettingsCard title="Download Folder">
        <div className="flex gap-2">
          <Input value={settings.default_download_folder} readOnly />
          <Button onClick={browse}>Browse</Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Download Defaults">
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <Switch checked={settings.auto_update_ytdlp} onChange={...} />
            <span>Auto-update yt-dlp on launch</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={settings.auto_convert_premiere} onChange={...} />
            <span>Auto-convert to Premiere-compatible</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={settings.show_all_formats} onChange={...} />
            <span>Show all formats (not just best per quality)</span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title="Performance">
        <div className="flex items-center gap-2">
          <Label>Max concurrent downloads:</Label>
          <Input type="number" min={1} max={5} value={settings.concurrencyLimit || 2} onChange={...} className="w-20" />
        </div>
      </SettingsCard>

      <SettingsCard title="Output">
        <Label>Filename pattern:</Label>
        <Input value={settings.filenamePattern || '{title}'} onChange={...} />
        <p className="text-caption text-muted">Supported: {`{title}`, `{channel}`, `{date}`, `{id}`}</p>
      </SettingsCard>
    </div>
  );
}
```

- [ ] **Create `SettingsPage.tsx`** with all controls.
- [ ] **Wire to settings store** — load/save via `useSettingsStore`.
- [ ] **Add gear icon** to header to open settings.

### Task 8.2: Build Download History panel

**Files:**
- Create: `src/features/download-history/HistoryPanel.tsx`

Shows completed and failed downloads from the Rust queue. Items show: title, filename, output path, timestamp, file size, status, retry/delete actions.

- [ ] **Create `HistoryPanel.tsx`** — fetches queue from Rust, displays history.
- [ ] **Add history button** to header — opens a scrollable panel/overlay.
- [ ] **Wire actions** — retry, open in explorer, remove from history.
- [ ] **Verify** history persists across app restarts.

### Task 8.3: Add analysis caching

**Files:**
- Create: `src/stores/analysis-cache.ts`

```typescript
const cache = new Map<string, { result: AnalyzeResponse; timestamp: number }>();
const TTL = 10 * 60 * 1000; // 10 minutes

export function getCachedAnalysis(url: string): AnalyzeResponse | null {
  const entry = cache.get(url);
  if (entry && Date.now() - entry.timestamp < TTL) return entry.result;
  cache.delete(url);
  return null;
}

export function setCachedAnalysis(url: string, result: AnalyzeResponse) {
  cache.set(url, { result, timestamp: Date.now() });
}

export function invalidateCache(url: string) {
  cache.delete(url);
}
```

- [ ] **Create cache** — in-memory TTL cache for analysis results.
- [ ] **Wire into `analyzeUrl`** — check cache before calling Rust.

### Task 8.4: Mark orphaned queue items on startup

**Files:**
- Modify: `src-tauri/src/queue/mod.rs` — already started in Phase 4, complete here

Ensure on `load_saved_queue`:
- Items with `status: "Downloading"` or `status: "Queued"` are re-marked as `Failed("App was closed")`
- Items older than 30 days are pruned
- A schema version is stored alongside data

- [ ] **Complete startup cleanup** — orphan marking, age-based pruning, schema version.
- [ ] **Verify** queue file is not growing unboundedly.

---

## Verification

- [ ] `cargo check` passes with no warnings.
- [ ] `npx tsc --noEmit` passes with no errors.
- [ ] `npx vite build` produces a successful build.
- [ ] End-to-end flow: paste URL → analyze → configure → download → verify file on disk.
- [ ] Playlist flow: paste → analyze → select → download batch → verify files.
