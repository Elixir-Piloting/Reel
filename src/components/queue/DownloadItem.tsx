import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";
import type { DownloadItem as DownloadItemType } from "@/lib/tauri";
import { cancelDownload } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface Props {
  item: DownloadItemType;
}

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

export function DownloadItemRow({ item }: Props) {
  const isFinished = item.status === "Completed" || item.status === "Failed" || item.status === "Cancelled";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex justify-between items-start">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <span className={cn("text-xs shrink-0 ml-2", statusColors[item.status] || "")}>
            {statusLabels[item.status] || item.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
        {(item.status === "Downloading" || item.status === "Merging" || item.status === "Converting") && (
          <div className="space-y-1">
            <Progress value={item.progress} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{item.progress.toFixed(1)}%</span>
              <span>{item.speed}</span>
              <span>{item.eta}</span>
            </div>
          </div>
        )}
        {item.status === "Completed" && <Progress value={100} className="h-1.5" />}
      </div>
      {!isFinished && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => cancelDownload(item.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
