import { useState, useEffect } from "react";
import { dataService } from "@/shared/lib/data-service";
import { FolderOpen, RotateCcw, Trash2, X } from "lucide-react";
import type { DownloadItem } from "@/shared/lib/types";

interface HistoryPanelProps {
  onClose: () => void;
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const [items, setItems] = useState<DownloadItem[]>([]);

  const fetchHistory = async () => {
    try {
      const queue = await dataService.getQueue();
      setItems(queue.filter((i) => i.status === 'Completed' || i.status === 'Failed' || typeof i.status === 'object'));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-modal h-full overflow-y-auto">
        <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
          <h2 className="text-heading font-semibold">Download History</h2>
          <div className="flex items-center gap-1">
            <button onClick={fetchHistory} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground" title="Refresh">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No download history yet</p>
          )}
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-elevated shadow-card">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => dataService.openInExplorer(item.output_path)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                  title="Open in Explorer"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => dataService.removeFromQueue(item.id).then(fetchHistory)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                  title="Remove from history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
