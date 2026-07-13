import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDownloadStore } from "@/stores/download-store";
import { formatDuration, formatDate } from "@/lib/utils";

export function MetadataCard() {
  const { metadata, error } = useDownloadStore();
  const [imgLoaded, setImgLoaded] = useState(false);

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!metadata) return null;

  return (
    <Card>
      <CardContent className="p-4 flex gap-4">
        <div className="relative w-40 h-24 shrink-0 rounded-md overflow-hidden bg-muted">
          {metadata.thumbnail_url && (
            <img
              src={metadata.thumbnail_url}
              alt={metadata.title}
              className={`w-full h-full object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
            />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="font-semibold text-base leading-tight truncate">{metadata.title}</h2>
          <p className="text-sm text-muted-foreground">{metadata.channel}</p>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{formatDuration(metadata.duration)}</span>
            <span>{formatDate(metadata.upload_date)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
