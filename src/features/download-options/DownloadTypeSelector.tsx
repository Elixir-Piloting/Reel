import { useOptionsStore } from "@/stores/options-store";

export function DownloadTypeSelector() {
  const downloadType = useOptionsStore((s) => s.downloadType);
  const setDownloadType = useOptionsStore((s) => s.setDownloadType);

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">Download Type</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setDownloadType("video")}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
            downloadType === "video"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
          }`}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <span className="text-sm font-medium">Video</span>
          <span className="text-xs text-muted-foreground text-center leading-tight">Video + Audio</span>
        </button>
        <button
          onClick={() => setDownloadType("audio")}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
            downloadType === "audio"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
          }`}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span className="text-sm font-medium">Audio</span>
          <span className="text-xs text-muted-foreground text-center leading-tight">Audio Only</span>
        </button>
      </div>
    </div>
  );
}
