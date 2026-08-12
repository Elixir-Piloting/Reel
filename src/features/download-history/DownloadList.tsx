import { FolderOpen, RotateCcw, Trash2, X, ImageIcon, Ban, XCircle, Pause, Play, MoreVertical } from "lucide-react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { dataService } from "@/shared/lib/data-service";
import type { DownloadItem } from "@/shared/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  items: DownloadItem[];
  onRefresh: () => void;
  searchQuery?: string;
}

export function DownloadItemCard({ item, onRefresh }: { item: DownloadItem; onRefresh: () => void }) {
  const st = item.status;
  const downloading = ['Downloading', 'Merging', 'Converting'].includes(st);
  const queued = st === 'Queued';
  const paused = st === 'Paused';
  const completed = st === 'Completed';
  const cancelled = st === 'Cancelled';
  const failed = st === 'Failed';
  const terminal = completed || cancelled || failed;
  const isConverting = st === 'Converting';

  return (
    <div className="flex items-start gap-3 p-3 rounded-md clay-raised">
      {item.thumbnail_url ? (
        <div className="w-32 shrink-0 rounded overflow-hidden bg-muted aspect-video">
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-32 shrink-0 rounded bg-muted flex items-center justify-center aspect-video">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium line-clamp-2 leading-tight">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {downloading && (
            <PieProgress percent={item.progress} size={20} />
          )}
          {completed && (
            <CheckCircleIcon size={20} className="text-green-500 shrink-0" weight="fill" />
          )}
          {cancelled && (
            <XCircle className="w-4 h-4 text-destructive shrink-0" />
          )}
          {failed && item.error?.toLowerCase().includes('yt-dlp') && (
            <div className="mt-2 p-2 border border-destructive/30 bg-destructive/10 rounded text-center">
              <p className="text-xs font-medium">yt-dlp unavailable</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">The download tool is missing or was not set up.</p>
              <button onClick={() => dataService.updateYtdlp()} className="text-[10px] text-primary underline mt-1">Download yt-dlp</button>
            </div>
          )}
          {paused && (
            <Pause className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className={`text-xs ${downloading ? 'text-muted-foreground' : completed ? 'text-muted-foreground' : cancelled ? 'text-destructive' : failed ? 'text-destructive' : paused ? 'text-muted-foreground' : ''}`}>
            {downloading && `${st === 'Converting' ? 'converting' : st === 'Merging' ? 'merging' : 'downloading'} ${item.progress.toFixed(0)}%`}
            {queued && 'queued'}
            {paused && 'Paused'}
            {completed && 'downloaded'}
            {cancelled && 'Cancelled'}
            {failed && 'Failed'}
          </span>
          {queued && (
            <span className="text-xs text-muted-foreground">Queued</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(downloading || queued) && (
          <>
            {!isConverting && (
              <button
                onClick={() => dataService.pauseDownload(item.id).then(onRefresh)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                title="Pause"
              >
                <Pause className="w-4 h-4" />
              </button>
            )}
            {isConverting && (
              <span className="text-xs text-muted-foreground">finalizing…</span>
            )}
            <button
              onClick={() => dataService.cancelDownload(item.id).then(onRefresh)}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
              title="Cancel"
            >
              <Ban className="w-4 h-4" />
            </button>
          </>
        )}
        {paused && (
          <button
            onClick={() => dataService.resumeDownload(item.id).then(onRefresh)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            title="Resume"
          >
            <Play className="w-4 h-4" />
          </button>
        )}
        {completed && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.output_path && (
                <DropdownMenuItem onClick={() => dataService.openInExplorer(item.output_path)}>
                  <FolderOpen className="w-4 h-4" />
                  Reveal in Explorer
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={async () => { await dataService.removeFromQueue(item.id); onRefresh(); }}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {(failed || cancelled) && (
          <button
            onClick={async () => { await dataService.retryDownload(item.id).then(() => onRefresh()); }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            title="Retry"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {!completed && (
          <button
            onClick={async () => {
              if (downloading || queued) {
                await dataService.cancelDownload(item.id);
              }
              await dataService.removeFromQueue(item.id);
              onRefresh();
            }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            title="Remove"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function DownloadList({ items, onRefresh, searchQuery }: Props) {
  const filtered = searchQuery
    ? items.filter((i) => i.title?.toLowerCase().includes(searchQuery.toLowerCase()) || i.filename?.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  const downloading = filtered.filter((i) => {
    return ['Downloading', 'Merging', 'Converting'].includes(i.status);
  });
  const queuedItems = filtered.filter((i) => {
    return i.status === 'Queued';
  });
  const pausedItems = filtered.filter((i) => {
    return i.status === 'Paused';
  });
  const downloaded = filtered.filter((i) => {
    return ['Completed', 'Failed', 'Cancelled'].includes(i.status);
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Downloading {downloading.length > 0 && `(${downloading.length})`}</h2>
        {downloading.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active downloads</p>
        ) : (
          <div className="space-y-2">
            {downloading.map((item) => (
              <DownloadItemCard key={item.id} item={item} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Queued {queuedItems.length > 0 && `(${queuedItems.length})`}</h2>
        {queuedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No queued items</p>
        ) : (
          <div className="space-y-2">
            {queuedItems.map((item) => (
              <DownloadItemCard key={item.id} item={item} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Paused {pausedItems.length > 0 && `(${pausedItems.length})`}</h2>
        {pausedItems.length === 0 ? null : (
          <div className="space-y-2">
            {pausedItems.map((item) => (
              <DownloadItemCard key={item.id} item={item} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </section>

      {downloaded.length > 0 && <div className="border-t border-border" />}

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Downloaded {downloaded.length > 0 && `(${downloaded.length})`}</h2>
        {downloaded.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No downloaded videos yet</p>
        ) : (
          <div className="space-y-2">
            {downloaded.map((item) => (
              <DownloadItemCard key={item.id} item={item} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}