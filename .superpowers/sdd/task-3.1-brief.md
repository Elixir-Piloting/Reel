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

