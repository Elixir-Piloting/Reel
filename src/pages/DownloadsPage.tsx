import { useState, useEffect, useRef } from "react";
import { Search, Ban, Pause, Play } from "lucide-react";
import { dataService } from "@/shared/lib/data-service";
import { Input } from "@/components/ui/input";
import { DownloadList } from "@/features/download-history/DownloadList";
import { Button } from "@/components/ui/button";
import type { DownloadItem } from "@/shared/lib/types";

export function DownloadsPage() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [search, setSearch] = useState("");
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

  const activeCount = items.filter((i) => {
    const s = typeof i.status === 'string' ? i.status : '';
    return ['Queued', 'Downloading', 'Merging', 'Converting'].includes(s);
  }).length;

  const pausedCount = items.filter((i) => {
    const s = typeof i.status === 'string' ? i.status : '';
    return s === 'Paused';
  }).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search downloads..."
            className="pl-9 h-9"
          />
        </div>
        {activeCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => { await dataService.pauseAllDownloads(); fetchHistory(); }}
            className="h-9 gap-1.5"
          >
            <Pause className="w-4 h-4" />
            Pause All
          </Button>
        )}
        {pausedCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => { await dataService.resumeAllDownloads(); fetchHistory(); }}
            className="h-9 gap-1.5"
          >
            <Play className="w-4 h-4" />
            Resume All
          </Button>
        )}
        {activeCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => { await dataService.cancelAllDownloads(); fetchHistory(); }}
            className="h-9 gap-1.5"
          >
            <Ban className="w-4 h-4" />
            Cancel All
          </Button>
        )}
      </div>
      <DownloadList items={items} onRefresh={fetchHistory} searchQuery={search} />
    </div>
  );
}