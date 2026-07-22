import { useState, useEffect, useRef } from "react";
import { RotateCcw, X, ExternalLink } from "lucide-react";
import { dataService } from "@/shared/lib/data-service";
import type { DownloadItem } from "@/shared/lib/types";
import { DownloadList } from "./DownloadList";

interface Props {
  onClose: () => void;
  onViewFull: () => void;
}

export function HistoryPanel({ onClose, onViewFull }: Props) {
  const [items, setItems] = useState<DownloadItem[]>([]);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-modal h-full flex flex-col">
        <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border z-10 px-4 py-3 flex items-center justify-between">
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
        <DownloadList items={items} onRefresh={fetchHistory} />
        <div className="border-t border-border p-3">
          <button
            onClick={onViewFull}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 rounded-md hover:bg-accent"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Full History
          </button>
        </div>
      </div>
    </div>
  );
}
