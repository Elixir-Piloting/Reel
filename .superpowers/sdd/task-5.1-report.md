# Task 5.1 Report — Stabilize layout (remove phase-gate pattern)

**Status**: ✅ Complete

**Commit**: `04f6fe6` — `feat: stable layout with animated phase transitions, wire up startDownload`

## Changes

### `src/pages/DownloadPage.tsx`
- Replaced the phase-gate `if/return` pattern with a single stable layout
- `UrlInput` is always mounted (never unmounts/remounts)
- Added `AnimatedSection` component that uses Tailwind transitions (`opacity` + `max-height`) for smooth enter/leave animations
- Content sections (VideoInfo, download options, buttons, etc.) appear/disappear based on `phase` without full DOM remounting
- Preserved all phase behaviors: idle, analyzing, ready, playlist, downloading, completed, error

### `src/stores/download-execution-store.ts`
- Wired up `startDownload` — reads URL/metadata from `useAnalysisStore` and options from `useOptionsStore`, constructs a `DownloadRequest`, calls `dataService.enqueueDownload`
- Fixed local `DownloadItem` interface `status` field type to match the imported type (`string | Record<string, string>`)

## Build Verification

- `npx tsc --noEmit` — ✅ passed (no errors)
- `npx vite build` — ✅ passed (434 KB JS, 107 KB CSS)

## Report

`C:\dev\tauri\ytmate\.superpowers\sdd\task-5.1-report.md`
