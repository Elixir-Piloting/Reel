import { useEffect } from "react";
import { useQueueStore } from "@/stores/queue-store";
import { DownloadItemRow } from "./DownloadItem";

export function DownloadQueue() {
  const { items, loadQueue, initListener } = useQueueStore();

  useEffect(() => {
    loadQueue();
    const cleanup = initListener();
    return () => cleanup();
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Queue</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <DownloadItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
