import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { dataService } from "@/shared/lib/data-service";
import { Input } from "@/components/ui/input";
import { DownloadList } from "@/features/download-history/DownloadList";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search downloads..."
          className="pl-9 h-9"
        />
      </div>
      <DownloadList items={items} onRefresh={fetchHistory} searchQuery={search} />
    </div>
  );
}
