import { useState, useEffect, useRef } from "react";
import { dataService } from "@/shared/lib/data-service";
import { FolderOpen, RotateCcw, Trash2, X, ImageIcon, Ban } from "lucide-react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import type { DownloadItem } from "@/shared/lib/types";
import { useDownloadExecutionStore } from "@/stores/download-execution-store";

interface HistoryPanelProps {
  onClose: () => void;
}

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

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [tab, setTab] = useState<'downloading' | 'downloaded'>('downloading');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = async () => {
    try {
      const queue = await dataService.getQueue();
      setItems(queue.reverse());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchHistory();
    intervalRef.current = setInterval(fetchHistory, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const downloading = items.filter((i) => {
    const s = typeof i.status === 'string' ? i.status : '';
    return ['Queued', 'Downloading', 'Merging', 'Converting'].includes(s);
  });
  const downloaded = items.filter((i) => {
    const s = typeof i.status === 'string' ? i.status : '';
    return ['Completed', 'Failed', 'Cancelled'].includes(s);
  });
  const current = tab === 'downloading' ? downloading : downloaded;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-modal h-full flex flex-col">
        <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-heading font-semibold">Downloads</h2>
            <div className="flex items-center gap-1">
              <button onClick={fetchHistory} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground" title="Refresh">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
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
            return (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-elevated shadow-card">
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
                    {st === 'Failed' && (
                      <span className="text-xs text-destructive">Failed</span>
                    )}
                    <span className={`text-xs ${active ? 'text-muted-foreground' : completed ? 'text-muted-foreground' : ''}`}>
                      {active && `downloading ${item.progress.toFixed(0)}%`}
                      {completed && 'downloaded'}
                    </span>
                    {(st === 'Queued' || st === 'Merging' || st === 'Converting') && (
                      <span className="text-xs text-muted-foreground capitalize">{st.toLowerCase()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {active && (
                    <button
                      onClick={() => dataService.cancelDownload(item.id).then(fetchHistory)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                      title="Cancel"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  {completed && item.output_path && (
                    <button
                      onClick={() => dataService.openInExplorer(item.output_path)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                      title="Open in Explorer"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  )}
                  {completed && (
                    <button
                      onClick={async () => { await dataService.removeFromQueue(item.id); fetchHistory(); }}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {st === 'Failed' && (
                    <button
                      onClick={async () => { await dataService.removeFromQueue(item.id); fetchHistory(); }}
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
      </div>
    </div>
  );
}