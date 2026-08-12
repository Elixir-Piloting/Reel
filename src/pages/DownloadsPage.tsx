import { useState, useEffect, useRef } from "react";
import { Search, Ban, Pause, Play } from "lucide-react";
import { dataService } from "@/shared/lib/data-service";
import { Input } from "@/components/ui/input";
import { DownloadList } from "@/features/download-history/DownloadList";
import { Button } from "@/components/ui/button";
import type { DownloadItem } from "@/shared/lib/types";

function useQueuePolling(intervalMs = 2000) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const hasActive = queue.some(item =>
    item.status === 'Downloading' || item.status === 'Queued'
  );

  const refresh = async () => {
    try {
      const items = await dataService.getQueue();
      setQueue(items.reverse());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, hasActive ? 2000 : 30_000);
    return () => clearInterval(id);
  }, [hasActive]);

  return { queue, refresh };
}

export function DownloadsPage() {
  const [search, setSearch] = useState("");
  const { queue: items, refresh } = useQueuePolling(2000);

  const activeCount = items.filter((i) => {
    return ['Queued', 'Downloading', 'Merging', 'Converting'].includes(i.status);
  }).length;

  const pausedCount = items.filter((i) => {
    return i.status === 'Paused';
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
            className="pl-9 h-9 clay-pressed"
          />
        </div>
        {activeCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => { await dataService.pauseAllDownloads(); refresh(); }}
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
            onClick={async () => { await dataService.resumeAllDownloads(); refresh(); }}
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
            onClick={async () => { await dataService.cancelAllDownloads(); refresh(); }}
            className="h-9 gap-1.5"
          >
            <Ban className="w-4 h-4" />
            Cancel All
          </Button>
        )}
      </div>
      <DownloadList items={items} onRefresh={refresh} searchQuery={search} />
    </div>
  );
}