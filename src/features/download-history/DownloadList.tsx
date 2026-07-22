import { useState } from "react";
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

  const [tab, setTab] = useState<'downloading' | 'downloaded'>('downloading');
  const current = tab === 'downloading' ? downloading : downloaded;

  return (
    <>
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('downloading')}
          className={`flex-1 px-4 py-2 text-sm font-medium text-center border-b-2 transition-colors ${
            tab === 'downloading'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Downloading{downloading.length > 0 ? ` (${downloading.length})` : ''}
        </button>
        <button
          onClick={() => setTab('downloaded')}
          className={`flex-1 px-4 py-2 text-sm font-medium text-center border-b-2 transition-colors ${
            tab === 'downloaded'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Downloaded
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {current.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {tab === 'downloading' ? 'No active downloads' : 'No downloaded videos yet'}
          </p>
        )}
        {current.map((item) => {
          const st = typeof item.status === 'string' ? item.status : '';
          const active = ['Queued', 'Downloading', 'Merging', 'Converting'].includes(st);
          const completed = st === 'Completed';
          const cancelled = st === 'Cancelled';
          return (
            <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg bg-elevated shadow-card ${cancelled ? 'opacity-60' : ''}`}>
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
        })}
      </div>
    </>
  );
}
