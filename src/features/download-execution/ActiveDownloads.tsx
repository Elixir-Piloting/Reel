import { useState, useEffect, useCallback } from "react";
import { dataService } from "@/shared/lib/data-service";
import { ACTIVE_STATUSES } from "@/shared/lib/active-statuses";
import { DownloadItemCard } from "@/features/download-history/DownloadList";
import type { DownloadItem } from "@/shared/lib/types";

export function ActiveDownloads() {
  const [items, setItems] = useState<DownloadItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const queue = await dataService.getQueue();
      setItems(queue.reverse());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const active = items.filter((i) => ACTIVE_STATUSES.includes(i.status));

  if (active.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground mb-3">
        Downloading ({active.length})
      </h2>
      <div className="space-y-2">
        {active.map((item) => (
          <DownloadItemCard key={item.id} item={item} onRefresh={refresh} />
        ))}
      </div>
    </section>
  );
}
