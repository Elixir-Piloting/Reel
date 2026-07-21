# YTMate UI Redesign: Sidebar Navigation & Page Split

## Overview

Replace the current single-column feed with a sidebar-driven multi-page layout. The app splits into four pages (Download, Queue, History, Settings) with a shared data backend.

## Navigation

- Fixed sidebar on the left, 48px collapsed (icons only) / 200px expanded with labels
- Hover expands; active page gets a primary-color left-border indicator
- No external router — `useState<Page>` in `App.tsx` drives which page component renders
- lucide icons: Download (`Download`), Queue (`List`), History (`Clock`), Settings (`Cog`)

## Page: Download

Unchanged from current layout — single column compact:

```
[URL Input bar with paste btn + analyze btn]
[MetadataCard: thumbnail | title, channel, duration]
[DownloadTypeTabs: Video | Audio]
[FormatSelector: scrollable format list with codec icons, auto-merge badge]
[PremiereToggle + AdvancedSection (start/end time)]
[Save Location input (folder\filename.ext), Browse btn, Download btn]
```

## Page: Queue

- Filter tabs at top: All / Active / Completed / Failed
- Items sorted: active (downloading/queued) first, then by recency
- Each row:
  - 64px thumbnail (or placeholder icon)
  - Title (truncated) + filename below
  - If active: Progress bar + % / speed / ETA
  - Status badge (colored text: Queued, Downloading, Completed, Failed, Cancelled)
  - Cancel X button (hidden if already finished)
- New items appear instantly via `download-item-update` Tauri event
- Progress updates merged in real-time via `download-progress` event

## Page: History

- Same backing data as Queue (`useQueueStore`)
- Default filter: Completed / Failed / Cancelled
- Same row layout as Queue but:
  - No progress bars (show final 100% bar for completed)
  - No cancel button (replaced by Retry button on failed items)
  - "Clear All" button in header — clears from Rust queue store
- `DownloadStatus::Failed(String)` shows error detail as tooltip or secondary text

## Page: Settings

- Default download folder: read-only path input + Browse button
- Auto-update yt-dlp on startup: toggle switch
- Update yt-dlp now: button with status text (Checking / Updated / Failed)
- Auto-premiere conversion: toggle switch

## Data Flow

- `useQueueStore` is the single source of truth for all queue items
- Queue and History pages both read `items` from the same store, just apply different filters
- Rust backend unchanged — `enqueue_download`, `cancel_download`, `get_queue`, `get_settings`, `save_settings`, `update_ytdlp` remain as-is
- Tauri events `download-item-update` and `download-progress` continue to drive real-time updates

## Files to Create/Modify

### Create:
- `src/components/layout/Sidebar.tsx` — sidebar nav component
- `src/pages/QueuePage.tsx` — queue page with filters
- `src/pages/HistoryPage.tsx` — history page with filters and clear
- `src/pages/SettingsPage.tsx` — extracted from current settings component

### Modify:
- `src/App.tsx` — add sidebar + page routing
- `src/components/layout/AppShell.tsx` — adjust to accommodate sidebar
- `src/stores/queue-store.ts` — add `removeItem`, `clearCompleted`, `retryItem` actions
- `src/components/queue/DownloadItem.tsx` — add retry button, show failed error

### Remove:
- `src/components/settings/SettingsPage.tsx` (replaced by `src/pages/SettingsPage.tsx`)
- `src/components/queue/DownloadQueue.tsx` (logic moved into QueuePage/HistoryPage)

## Future Considerations

- Bulk cancel/retry in Queue
- Search/filter by URL or title
- Download speed limit setting
- Proxy configuration
