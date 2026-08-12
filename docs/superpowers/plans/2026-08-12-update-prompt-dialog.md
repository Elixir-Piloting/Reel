# Update Prompt Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent auto-install on startup with a dialog showing current vs latest version and letting the user choose Update Now or Update Later.

**Architecture:** The startup `check()` in `App.tsx` stores the result in state instead of installing. A new `UpdateDialog` component (wrapping the existing `AlertDialog`) renders the prompt; Update Now queries the queue and, if downloads are active, swaps to a warning view inside the same dialog before installing. Update Later just dismisses — nothing is installed or persisted, so the next launch re-prompts.

**Tech Stack:** React 19, TypeScript, base-ui `AlertDialog` (`@base-ui/react`), `@tauri-apps/plugin-updater`, `@tauri-apps/api/event`, zustand-free local state.

## Global Constraints

- No unit-test infrastructure exists in this repo. Verification is `npx tsc --noEmit` then `npm run build` (must pass), plus the manual release-build test at the end.
- Do NOT modify `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, or the Settings page (`src/features/settings/SettingsPage.tsx`) updater code.
- Reuse `src/components/ui/alert-dialog.tsx`; do not add new dialog primitives.
- Active-status set is exactly `["Queued", "Downloading", "Merging", "Converting", "Paused"]`.
- The startup check runs only when `!import.meta.env.DEV`.
- Copy strings verbatim from the spec: "New update available", "You're on version X. Version Y is available.", "Downloads are in progress", "Downloads in progress will be cancelled if you update now.", "Update Now", "Update Later", "Go back", "Cancel downloads & Update".

---
### Task 1: Create the UpdateDialog component

**Files:**
- Create: `src/features/updater/UpdateDialog.tsx`

**Interfaces:**
- Consumes:
  - `AlertDialog`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from `@/components/ui/alert-dialog`
  - `buttonVariants` from `@/components/ui/button`
  - `dataService.getQueue(): Promise<DownloadItem[]>` and `dataService.cancelAllDownloads(): Promise<number>` from `@/shared/lib/data-service`
  - `emit` from `@tauri-apps/api/event`
  - type `Update` from `@tauri-apps/plugin-updater` (has `.currentVersion`, `.version`, `.downloadAndInstall()`)
- Produces: `UpdateDialog({ update: Update | null, onClose: () => void })`. Returns `null` when `update` is `null`; otherwise renders one controlled `AlertDialog` whose content switches between the main prompt and the active-downloads warning.

- [ ] **Step 1: Create `src/features/updater/UpdateDialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { emit } from "@tauri-apps/api/event";
import { buttonVariants } from "@/components/ui/button";
import { dataService } from "@/shared/lib/data-service";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ACTIVE_STATUSES = ["Queued", "Downloading", "Merging", "Converting", "Paused"];

interface Props {
  update: Update | null;
  onClose: () => void;
}

export function UpdateDialog({ update, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (update) setOpen(true);
  }, [update]);

  if (!update) return null;

  const install = async () => {
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      emit("app:restart");
    } catch (e) {
      console.error("[updater] install failed", e);
      onClose();
    }
  };

  const handleUpdateNow = async () => {
    try {
      const queue = await dataService.getQueue();
      const active = queue.filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
      if (active > 0) {
        setConfirmActive(true);
      } else {
        await install();
      }
    } catch {
      await install();
    }
  };

  const handleConfirmInstall = async () => {
    try {
      await dataService.cancelAllDownloads();
    } catch {
      /* ignore */
    }
    await install();
  };

  const closeDialog = () => {
    setConfirmActive(false);
    setOpen(false);
    onClose();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setConfirmActive(false);
      }}
    >
      <AlertDialogContent>
        {confirmActive ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Downloads are in progress</AlertDialogTitle>
              <AlertDialogDescription>
                Downloads in progress will be cancelled if you update now.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <button
                type="button"
                disabled={installing}
                onClick={() => setConfirmActive(false)}
                className={buttonVariants({ variant: "outline" })}
              >
                Go back
              </button>
              <button
                type="button"
                disabled={installing}
                onClick={handleConfirmInstall}
                className={buttonVariants({ variant: "destructive" })}
              >
                {installing ? "Installing…" : "Cancel downloads & Update"}
              </button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>New update available</AlertDialogTitle>
              <AlertDialogDescription>
                You're on version {update.currentVersion}. Version {update.version} is available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <button
                type="button"
                disabled={installing}
                onClick={closeDialog}
                className={buttonVariants({ variant: "outline" })}
              >
                Update Later
              </button>
              <button
                type="button"
                disabled={installing}
                onClick={handleUpdateNow}
                className={buttonVariants()}
              >
                {installing ? "Installing…" : "Update Now"}
              </button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0, no output.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built in ...` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/updater/UpdateDialog.tsx
git commit -m "feat: add update prompt dialog component"
```

---
### Task 2: Wire the dialog into the startup check

**Files:**
- Modify: `src/App.tsx` (whole file — it is 38 lines)

**Interfaces:**
- Consumes: `UpdateDialog` from `src/features/updater/UpdateDialog.tsx` — signature `{ update: Update | null; onClose: () => void }`; `check()` from `@tauri-apps/plugin-updater` (dynamic import); type `Update` from `@tauri-apps/plugin-updater`.
- Produces: startup behavior where an available update surfaces through the dialog instead of auto-installing. `emit("app:restart")` is no longer referenced in `App.tsx` (moved into the dialog).

- [ ] **Step 1: Rewrite `src/App.tsx`**

Replace the entire file with:

```tsx
import { useState, useEffect } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import type { Update } from "@tauri-apps/plugin-updater";
import { RootLayout } from "@/components/layout/RootLayout";
import { DownloadPage } from "@/pages/DownloadPage";
import { DownloadsPage } from "@/pages/DownloadsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { UpdateDialog } from "@/features/updater/UpdateDialog";

const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <DownloadPage /> },
      { path: "/downloads", element: <DownloadsPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const result = await check();
        if (result) setUpdate(result);
      } catch (e) {
        console.error("[updater] check failed", e);
      }
    })();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <UpdateDialog update={update} onClose={() => setUpdate(null)} />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0, no output.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built in ...` with no errors.

- [ ] **Step 4: Manual release-build test**

Runtime behavior cannot be exercised in `tauri dev` (the check is disabled in DEV). Follow these steps against a real release build:

1. Bump the app version, publish a release, and update the `update.json` at `https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/update.json` to point at it.
2. Launch the previous release → dialog appears with "New update available", showing current and latest versions.
3. "Update Later" → dialog closes, app stays running on the current version; no installer runs.
4. Relaunch → the dialog appears again (nothing was remembered).
5. With no active downloads: "Update Now" → downloads, installs, and restarts the app.
6. Start a download, then "Update Now" → warning view shows "Downloads are in progress"; "Go back" returns to the main prompt and keeps the download; "Cancel downloads & Update" cancels the download, installs, and restarts.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: prompt before installing update instead of auto-installing"
```
