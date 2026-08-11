import { useOptionsStore } from "@/stores/options-store";
import { useAnalysisStore } from "@/stores/analysis-store";

export function DownloadTypeSelector() {
  const downloadType = useOptionsStore((s) => s.downloadType);
  const setDownloadType = useOptionsStore((s) => s.setDownloadType);
  const setEncoding = useOptionsStore((s) => s.setEncoding);
  const rebuildQualityOptions = useAnalysisStore((s) => s.rebuildQualityOptions);

  const handleTypeChange = (t: 'video' | 'audio') => {
    setDownloadType(t);
    setEncoding(t === 'audio' ? 'mp3' : 'mp4_h264');
    rebuildQualityOptions();
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">Download Type</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleTypeChange("video")}
          className={`flex flex-col items-center gap-2 rounded-md border-2 p-4 transition-all ${
            downloadType === "video"
              ? "border-accent text-glow shadow-soft"
              : "border-background text-muted-foreground hover:text-foreground"
          } bg-surface-overlay inset-highlight`}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <span className="text-sm font-medium">Video</span>
          <span className={`text-xs text-center leading-tight ${downloadType === "video" ? "text-accent/80" : "text-muted-foreground"}`}>Video + Audio</span>
        </button>
        <button
          onClick={() => handleTypeChange("audio")}
          className={`flex flex-col items-center gap-2 rounded-md border-2 p-4 transition-all ${
            downloadType === "audio"
              ? "border-accent text-glow shadow-soft"
              : "border-background text-muted-foreground hover:text-foreground"
          } bg-surface-overlay inset-highlight`}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span className="text-sm font-medium">Audio</span>
          <span className={`text-xs text-center leading-tight ${downloadType === "audio" ? "text-accent/80" : "text-muted-foreground"}`}>Audio Only</span>
        </button>
      </div>
    </div>
  );
}
