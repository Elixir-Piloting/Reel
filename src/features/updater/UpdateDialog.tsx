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
