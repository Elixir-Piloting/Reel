import { useDownloadStore } from "@/stores/download-store";
import { formatBytes, cn } from "@/lib/utils";

export function FormatSelector() {
  const { formats, selectedFormatId, setSelectedFormatId, premiereMode } = useDownloadStore();

  if (formats.length === 0) return null;

  const filtered = premiereMode
    ? formats.filter((f) => f.container === "MP4" && f.video_codec === "H.264")
    : formats;

  if (filtered.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">Format</p>
        <p className="text-xs text-muted-foreground">No formats match the Premiere filter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Format</p>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {filtered.map((fmt) => (
          <button
            key={fmt.format_id}
            onClick={() => setSelectedFormatId(fmt.format_id)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md text-sm border transition-colors",
              selectedFormatId === fmt.format_id
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted"
            )}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{fmt.resolution}</span>
              <span className="text-muted-foreground text-xs">
                {fmt.filesize ? formatBytes(fmt.filesize) : "Unknown size"}
              </span>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{fmt.video_codec}</span>
              <span>{fmt.audio_codec}</span>
              <span>{fmt.container}</span>
              {fmt.fps && fmt.fps > 30 && <span>{fmt.fps}fps</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
