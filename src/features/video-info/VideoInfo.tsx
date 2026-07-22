import { useAnalysisStore } from "@/stores/analysis-store";
import { Skeleton } from "@/components/ui/skeleton";

export function VideoInfo() {
  const error = useAnalysisStore((s) => s.error);
  const isAnalyzing = useAnalysisStore((s) => s.phase) === "analyzing";

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!isAnalyzing) return null;

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <Skeleton className="w-full aspect-video rounded-lg" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="space-y-1">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
