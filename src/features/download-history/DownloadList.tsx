import { FolderOpen, RotateCcw, Trash2, X, ImageIcon, Ban, XCircle } from "lucide-react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { dataService } from "@/shared/lib/data-service";
import type { DownloadItem } from "@/shared/lib/types";

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

function DownloadItemCard({ item, onRefresh }: { item: DownloadItem; onRefresh: () => void }) {
  const st = typeof item.status === 'string' ? item.status : '';
  const active = ['Queued', 'Downloading', 'Merging', 'Converting'].includes(st);
  const completed = st === 'Completed';
  const cancelled = st === 'Cancelled';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg bg-elevated shadow-card ${cancelled ? 'opacity-60' : ''}`}>
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
          {active && (
            <PieProgress percent={item.progress} size={20} />
          )}
          {completed && (
            <CheckCircleIcon size={20} className="text-green-500 shrink-0" weight="fill" />
          )}
          {cancelled && (
            <XCircle className="w-4 h-4 text-destructive shrink-0" />
          )}
          {st === 'Failed' && (
            <span className="text-xs text-destructive">Failed</span>
          )}
          <span className={`text-xs ${active ? 'text-muted-foreground' : completed ? 'text-muted-foreground' : cancelled ? 'text-destructive' : ''}`}>
            {active && `downloading ${item.progress.toFixed(0)}%`}
            {completed && 'downloaded'}
            {cancelled && 'Cancelled'}
          </span>
          {(st === 'Queued' || st === 'Merging' || st === 'Converting') && (
            <span className="text-xs text-muted-foreground capitalize">{st.toLowerCase()}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {active && (
          <button
            onClick={() => dataService.cancelDownload(item.id).then(onRefresh)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            title="Cancel"
          >
            <Ban className="w-4 h-4" />
          </button>
        )}
        {(completed || cancelled) && item.output_path && (
          <button
            onClick={() => dataService.openInExplorer(item.output_path)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            title="Open in Explorer"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        )}
        {(completed || cancelled) && (
          <button
            onClick={async () => { await dataService.removeFromQueue(item.id); onRefresh(); }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {st === 'Failed' && (
          <button
            onClick={async () => { await dataService.removeFromQueue(item.id); onRefresh(); }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            title="Dismiss"
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
    const s = typeof i.status === 'string' ? i.status : '';
    return ['Queued', 'Downloading', 'Merging', 'Converting'].includes(s);
  });
  const downloaded = filtered.filter((i) => {
    const s = typeof i.status === 'string' ? i.status : '';
    return ['Completed', 'Failed', 'Cancelled'].includes(s);
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Downloading</h2>
        {downloading.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No active downloads</p>
        ) : (
          <div className="space-y-2">
            {downloading.map((item) => (
              <DownloadItemCard key={item.id} item={item} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-border" />

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Downloaded</h2>
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
