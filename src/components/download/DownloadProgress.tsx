import { Progress } from "@/components/ui/progress";
import { X, FolderOpen, RotateCcw, ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { useDownloadStore } from "@/stores/download-store";
import { openInExplorer } from "@/lib/tauri";

const statusColors: Record<string, string> = {
  Queued: "text-muted-foreground",
  Downloading: "text-blue-500",
  Merging: "text-amber-500",
  Converting: "text-amber-500",
  Completed: "text-green-500",
  Failed: "text-destructive",
  Cancelled: "text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  Queued: "Queued",
  Downloading: "Downloading",
  Merging: "Merging...",
  Converting: "Converting...",
  Completed: "Completed",
  Failed: "Failed",
  Cancelled: "Cancelled",
};

interface Props {
  big?: boolean;
}

export function DownloadProgress({ big }: Props) {
  const { downloadItem, downloadProgress, downloadSpeed, downloadEta, downloadStatus, isDownloading, cancelDownload, startDownload, completedFileName } = useDownloadStore();

  if (!downloadItem && !isDownloading) return null;
  if (!downloadItem) {
    if (isDownloading) {
      return (
        <div className={`rounded-lg border bg-card ${big ? "p-8" : "p-4"} space-y-3`}>
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-16 h-10 bg-muted rounded overflow-hidden flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className={`font-medium truncate ${big ? "text-lg" : "text-sm"}`}>Starting download...</p>
              <Progress value={0} className="h-2" />
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const st = downloadStatus;
  const active = ["Queued", "Downloading", "Merging", "Converting"].includes(st);
  const finished = ["Completed", "Failed", "Cancelled"].includes(st);

  return (
    <div className={`rounded-lg border bg-card overflow-hidden ${big ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-stretch gap-0">
        <div className={`shrink-0 bg-muted flex items-center justify-center overflow-hidden aspect-video ${big ? "w-32" : "w-20"}`}>
          {downloadItem.thumbnail_url ? (
            <img
              src={downloadItem.thumbnail_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon className={`text-muted-foreground ${big ? "w-8 h-8" : "w-5 h-5"}`} />
          )}
        </div>
        <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-1">
          <div className="flex justify-between items-start gap-2">
            <p className={`font-medium truncate ${big ? "text-base" : "text-sm"}`}>{downloadItem.title || downloadItem.filename}</p>
            <span className={`shrink-0 flex items-center gap-1 ${statusColors[st] || ""} ${big ? "text-sm" : "text-xs"}`}>
              {st === "Completed" && <CheckCircle2 className="w-4 h-4" />}
              {st === "Failed" && <AlertCircle className="w-4 h-4" />}
              {statusLabels[st] || st}
            </span>
          </div>
          <p className={`text-muted-foreground truncate ${big ? "text-sm" : "text-xs"}`}>{completedFileName || downloadItem.filename}</p>
          {st === "Failed" && (
            <p className="text-xs text-destructive truncate">
              {typeof downloadItem.status === "object" ? Object.values(downloadItem.status as object)[0] : ""}
            </p>
          )}
          {active && (
            <div className={`space-y-1 ${big ? "mt-3" : "mt-1"}`}>
              <Progress value={downloadProgress} className={big ? "h-3" : "h-2"} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{downloadProgress.toFixed(1)}%</span>
                <span>{downloadSpeed}</span>
                <span>{downloadEta}</span>
              </div>
            </div>
          )}
          {st === "Completed" && <Progress value={100} className={`${big ? "h-3 mt-3" : "h-2 mt-1"}`} />}
        </div>
        <div className="flex flex-col justify-center gap-1 pr-3">
          {active && (
            <button
              onClick={cancelDownload}
              className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-8 w-8"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {st === "Failed" && (
            <button
              onClick={startDownload}
              className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-8 w-8"
              title="Retry"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {st === "Completed" && downloadItem.output_path && (
            <button
              onClick={() => openInExplorer(downloadItem.output_path)}
              className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-8 w-8"
              title="Open in Explorer"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
