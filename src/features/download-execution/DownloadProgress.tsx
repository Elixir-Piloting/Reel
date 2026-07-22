import { X, FolderOpen } from "lucide-react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useDownloadExecutionStore } from "@/stores/download-execution-store";
import { dataService } from "@/shared/lib/data-service";

function PieProgress({ percent, size = 28 }: { percent: number; size?: number }) {
  const r = size * 0.4;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 text-primary">
      <circle cx={center} cy={center} r={r} fill="none" stroke="currentColor" strokeWidth={size * 0.1} opacity="0.15" />
      <circle
        cx={center} cy={center} r={r}
        fill="none" stroke="currentColor" strokeWidth={size * 0.1}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        className="text-primary"
      />
    </svg>
  );
}

interface Props {
  big?: boolean;
}

export function DownloadProgress({ big }: Props) {
  const downloadItem = useDownloadExecutionStore((s) => s.downloadItem);
  const downloadProgress = useDownloadExecutionStore((s) => s.downloadProgress);
  const downloadStatus = useDownloadExecutionStore((s) => s.downloadStatus);
  const isDownloading = useDownloadExecutionStore((s) => s.isDownloading);
  const cancelDownload = useDownloadExecutionStore((s) => s.cancelDownload);
  const completedFileName = useDownloadExecutionStore((s) => s.completedFileName);

  if (!downloadItem && !isDownloading) return null;
  if (!downloadItem) {
    return (
      <div className="flex items-center gap-3">
        <PieProgress percent={0} size={28} />
        <span className="text-sm text-muted-foreground">Starting download...</span>
      </div>
    );
  }

  const st = downloadStatus;
  const active = ["Queued", "Downloading", "Merging", "Converting"].includes(st);
  const completed = st === "Completed";

  const thumb = (downloadItem as unknown as Record<string, unknown>).thumbnail_url as string | undefined;

  return (
    <div className="flex items-start gap-3">
      {thumb ? (
        <div className="w-2/5 shrink-0 rounded overflow-hidden bg-muted aspect-video">
          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-2/5 shrink-0" />
      )}
      <div className="flex-1 min-w-0 space-y-0.5">
          <p className={`font-medium line-clamp-2 leading-tight ${big ? "text-base" : "text-sm"}`}>{downloadItem.title || downloadItem.filename}</p>
          <p className="text-xs text-muted-foreground truncate">{completedFileName || downloadItem.filename}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            {active && (
              <>
                <PieProgress percent={downloadProgress} size={20} />
                <span className="text-xs text-muted-foreground">downloading {downloadProgress.toFixed(0)}%</span>
                {st !== "Downloading" && (
                  <span className="text-xs text-muted-foreground capitalize">({st.toLowerCase()})</span>
                )}
              </>
            )}
            {completed && (
              <>
                <CheckCircleIcon size={20} className="text-green-500 shrink-0" weight="fill" />
                <span className="text-xs text-muted-foreground">downloaded</span>
                <button
                  onClick={() => dataService.openInExplorer(downloadItem.output_path)}
                  className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1 ml-2"
                >
                  <FolderOpen className="w-3 h-3" />
                  reveal in explorer
                </button>
              </>
            )}
            {st === "Failed" && (
              <span className="text-xs text-destructive">Failed</span>
            )}
            {st === "Cancelled" && (
              <span className="text-xs text-muted-foreground">Cancelled</span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {active && (
            <button
              onClick={cancelDownload}
              className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-8 w-8 text-muted-foreground"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
}