import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MinusIcon, SquareIcon, ArrowsInSimpleIcon, XIcon } from "@phosphor-icons/react";
import reelLogo from "@/assets/reel-logo.png";
import { dataService } from "@/shared/lib/data-service";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ACTIVE_STATUSES = ["Queued", "Downloading", "Merging", "Converting", "Paused"];

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleClose = async () => {
    try {
      const queue = await dataService.getQueue();
      const active = queue.filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
      if (active > 0) {
        setActiveCount(active);
        setConfirmClose(true);
      } else {
        await appWindow.close();
      }
    } catch {
      await appWindow.close();
    }
  };

  const handleConfirmClose = async () => {
    try {
      await dataService.cancelAllDownloads();
    } finally {
      await appWindow.close();
    }
  };

  return (
    <div className="h-10 flex items-center justify-between shrink-0" data-tauri-drag-region>
      <div className="flex items-center gap-2 pl-3">
        <img src={reelLogo} alt="Reel" className="size-6 rounded" />
        <span className="text-sm font-semibold text-foreground">Reel</span>
      </div>
      <div className="flex items-center">
        <button
          onClick={() => appWindow.minimize()}
          className="flex items-center justify-center w-11 h-10 text-muted-foreground hover:bg-overlay hover:text-foreground transition-colors"
          title="Minimize"
        >
          <MinusIcon size={18} />
        </button>
        <button
          onClick={async () => { await appWindow.toggleMaximize(); setMaximized(await appWindow.isMaximized()); }}
          className="flex items-center justify-center w-11 h-10 text-muted-foreground hover:bg-overlay hover:text-foreground transition-colors"
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? <ArrowsInSimpleIcon size={18} /> : <SquareIcon size={18} />}
        </button>
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-10 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="Close"
        >
          <XIcon size={18} />
        </button>
      </div>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close while downloads are running?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeCount} download{activeCount === 1 ? "" : "s"} still in progress will be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmClose(false)}>Continue</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmClose}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
