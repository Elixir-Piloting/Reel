# Update Prompt Dialog Design

**Date:** 2026-08-12
**Status:** Approved

## Problem

On startup the app auto-checks for updates and, when one is found, immediately
downloads + installs + restarts with no user input. Users want control: they
should be told a new version exists (with current vs latest shown) and choose
"Update Now" or "Update Later". "Update Later" must not install anything and
must re-prompt on the next launch.

## Current Flow (as-built)

- `src/App.tsx` — on mount (non-`DEV`): `check()` from `@tauri-apps/plugin-updater`;
  if an update exists it calls `update.downloadAndInstall()` then `emit("app:restart")`.
- `src-tauri/src/lib.rs:34` — Rust `app:restart` listener calls `AppHandle::restart()`.
- `src-tauri/tauri.conf.json` — updater endpoints/pubkey, NSIS `installMode: passive`.
- Settings page ("Version & Updates" card) has its own manual check + install
  buttons; unchanged by this work.

## Design

### Architecture

- **New** `src/features/updater/UpdateDialog.tsx`
  - Wraps the existing `AlertDialog` primitive (`src/components/ui/alert-dialog.tsx`).
  - Props: `update: Update | null`, `onClose: () => void`.
  - Renders `null` when `update` is `null`.
- **Modified** `src/App.tsx`
  - Startup `check()` stores the result in state instead of installing immediately.
  - Renders `<UpdateDialog update={...} onClose={...} />` beside `<RouterProvider>`.
  - Keeps the `if (import.meta.env.DEV) return;` guard.

### Dialog content

- Title: "New update available"
- Body: "You're on version **X**. Version **Y** is available."
  - X = `update.currentVersion`, Y = `update.version` (both from the plugin; no
    extra invoke needed).
- Footer buttons:
  - **Update Later** — outline variant.
  - **Update Now** — default/accent variant.

### Update Now flow

1. Query `dataService.getQueue()` and filter for active statuses
   `["Queued", "Downloading", "Merging", "Converting", "Paused"]`.
2. If any item is active, swap the same dialog's content to a warning view:
   - Title: "Downloads are in progress"
   - Body: "Downloads in progress will be cancelled if you update now."
   - Buttons: **Go back** (outline) / **Cancel downloads & Update** (destructive).
   - On confirm: `dataService.cancelAllDownloads()`, then proceed to step 3.
3. `await update.downloadAndInstall()`.
4. `emit("app:restart")` — existing Rust listener restarts the app.

### Update Later flow

- Calls `onClose()` only. Nothing is installed, nothing persisted.
- Next launch re-runs the check and re-shows the dialog.

### Error handling

- `check()` throws → `console.error("[updater] check failed", e)` and show
  nothing (current behavior).
- `downloadAndInstall()` throws → `console.error` and close the dialog without
  restarting (user stays on the current version).

## Verification

- `npx tsc --noEmit` and `npm run build` must pass.
- Runtime verification requires a real release build plus a published
  `update.json`; manual test steps:
  1. Build a new release and publish `update.json` pointing at it.
  2. Launch the previous release → dialog appears with current + latest versions.
  3. "Update Later" → dialog closes, app stays on current version.
  4. Relaunch → dialog appears again.
  5. "Update Now" with no active downloads → installs and restarts.
  6. "Update Now" with a download running → warning dialog; "Go back" keeps the
     download; "Cancel downloads & Update" cancels, installs, restarts.
