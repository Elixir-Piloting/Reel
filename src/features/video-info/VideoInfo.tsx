import { useState } from "react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { formatDuration, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function VideoInfo() {
  const metadata = useAnalysisStore((s) => s.metadata);
  const phase = useAnalysisStore((s) => s.phase);
  const error = useAnalysisStore((s) => s.error);
  const isAnalyzing = phase === "analyzing";
  const [imgLoaded, setImgLoaded] = useState(false);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="flex gap-4">
        <Skeleton className="w-48 h-28 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    );
  }

  if (!metadata) return null;

  return (
    <div className="flex gap-4">
      <div className="relative w-48 h-28 shrink-0 rounded-lg overflow-hidden bg-muted">
        {metadata.thumbnail_url && (
          <img
            src={metadata.thumbnail_url}
            alt={metadata.title}
            className={`w-full h-full object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="font-semibold text-base leading-tight line-clamp-2">{metadata.title}</h2>
        <p className="text-sm text-muted-foreground">{metadata.channel}</p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{formatDuration(metadata.duration)}</span>
          <span>{formatDate(metadata.upload_date)}</span>
        </div>
      </div>
    </div>
  );
}
