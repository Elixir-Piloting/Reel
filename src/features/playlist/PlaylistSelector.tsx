
import { useAnalysisStore } from "@/stores/analysis-store";
import { useOptionsStore } from "@/stores/options-store";
import { useDownloadExecutionStore } from "@/stores/download-execution-store";
import { usePlaylistStore } from "@/stores/playlist-store";
import { formatDuration } from "@/lib/utils";
import { dataService } from "@/shared/lib/data-service";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Square, Download, RotateCcw, XCircle, Loader2, X } from "lucide-react";
import { CheckCircleIcon } from "@phosphor-icons/react";

export function PlaylistSelector() {
  const metadata = useAnalysisStore((s) => s.metadata);
  const playlistTitle = useAnalysisStore((s) => s.playlistTitle);
  const phase = useAnalysisStore((s) => s.phase);
  const qualityOptions = useAnalysisStore((s) => s.qualityOptions);
  const downloadType = useOptionsStore((s) => s.downloadType);
  const setDownloadType = useOptionsStore((s) => s.setDownloadType);
  const selectedQuality = useOptionsStore((s) => s.selectedQuality);
  const setSelectedQuality = useOptionsStore((s) => s.setSelectedQuality);
  const startPlaylistDownload = useDownloadExecutionStore((s) => s.startPlaylistDownload);
  const isDownloading = useDownloadExecutionStore((s) => s.isDownloading);
  const entries = usePlaylistStore((s) => s.entries);
  const selectedIndices = usePlaylistStore((s) => s.selectedIndices);
  const selectAll = usePlaylistStore((s) => s.selectAll);
  const toggleEntry = usePlaylistStore((s) => s.toggleEntry);
  const toggleSelectAll = usePlaylistStore((s) => s.toggleSelectAll);
  const itemProgress = usePlaylistStore((s) => s.itemProgress);

  const count = selectedIndices.length;

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">{playlistTitle || metadata?.playlist_title || "Playlist"}</h2>
            <p className="text-xs text-muted-foreground">{entries.length} videos</p>
          </div>
          {phase === "playlist" && (
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {selectAll ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {selectAll ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>

        <div className="h-80 overflow-y-auto flex flex-col gap-1.5">
          {entries.map((entry, idx) => {
            const progressItem = itemProgress[idx];
            const isDownloaded = phase === "downloading" || phase === "completed";
            const status = progressItem?.status;

            return (
              <div
                key={idx}
                onClick={() => phase === "playlist" && toggleEntry(idx)}
                className={`flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors ${
                  phase === "playlist" ? "hover:bg-accent/50 cursor-pointer" : ""
                } ${status === "completed" ? "opacity-60" : ""} ${status === "failed" ? "bg-destructive/5" : ""}`}
              >
                {phase === "playlist" ? (
                  <button
                    role="checkbox"
                    aria-checked={selectedIndices.includes(idx)}
                    onClick={() => toggleEntry(idx)}
                    className={`w-4 h-4 rounded shrink-0 border flex items-center justify-center transition-colors ${
                      selectedIndices.includes(idx)
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30 hover:border-muted-foreground/60"
                    }`}
                  >
                    {selectedIndices.includes(idx) && (
                      <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3 text-primary-foreground">
                        <path d="M13 4L6.5 12L3 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ) : (
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {status === "completed" ? (
                      <CheckCircleIcon size={16} className="text-green-500 shrink-0" weight="fill" />
                    ) : status === "failed" ? (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    ) : status === "cancelled" ? (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    ) : status === "downloading" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    ) : status === "queued" ? (
                      <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                    )}
                  </span>
                )}

                <div className="w-28 shrink-0 aspect-video rounded overflow-hidden bg-muted">
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    <span className="text-xs text-muted-foreground mr-1.5">#{idx + 1}</span>
                    {entry.title}
                  </p>
                  <p className="text-xs">
                    {entry.duration > 0 ? <span className="text-muted-foreground">{formatDuration(entry.duration)}</span> : ""}
                    {isDownloaded && status && status !== "queued" && (
                      <span className="ml-2">
                        {status === "downloading" && progressItem ? <span className="text-muted-foreground inline-flex items-center gap-1">
                          <svg width={12} height={12} viewBox="0 0 12 12" className="shrink-0 text-primary">
                            <circle cx={6} cy={6} r={4.8} fill="none" stroke="currentColor" strokeWidth={1.2} opacity="0.15" />
                            <circle cx={6} cy={6} r={4.8} fill="none" stroke="currentColor" strokeWidth={1.2} strokeDasharray={30.16} strokeDashoffset={30.16 - (Math.min(progressItem.progress, 100) / 100) * 30.16} strokeLinecap="round" transform="rotate(-90 6 6)" />
                          </svg>
                          {Math.round(progressItem.progress)}%
                        </span> : ""}
                        {status === "completed" ? <span className="text-green-600 dark:text-green-400">Downloaded</span> : ""}
                        {status === "failed" ? <span className="text-destructive">Failed</span> : ""}
                        {status === "cancelled" ? <span className="text-destructive">Cancelled</span> : ""}
                      </span>
                    )}
                  </p>
                  {isDownloaded && status === "downloading" && progressItem && progressItem.progress > 0 && (
                    <svg width={14} height={14} viewBox="0 0 14 14" className="shrink-0 text-primary inline-block align-middle ml-1">
                      <circle cx={7} cy={7} r={5.6} fill="none" stroke="currentColor" strokeWidth={1.4} opacity="0.15" />
                      <circle cx={7} cy={7} r={5.6} fill="none" stroke="currentColor" strokeWidth={1.4} strokeDasharray={35.19} strokeDashoffset={35.19 - (Math.min(progressItem.progress, 100) / 100) * 35.19} strokeLinecap="round" transform="rotate(-90 7 7)" />
                    </svg>
                  )}
                </div>
                {isDownloaded && status === "downloading" && (
                  <div className="shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); dataService.cancelDownload(entry.id); }}
                      className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-7 w-7 text-muted-foreground transition-colors"
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {phase === "playlist" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Download Type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setDownloadType("video"); useOptionsStore.getState().setEncoding("mp4_h264"); useAnalysisStore.getState().rebuildQualityOptions(); }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all ${
                    downloadType === "video"
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span className="text-xs font-medium">Video</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">+ Audio</span>
                </button>
                <button
                  onClick={() => { setDownloadType("audio"); useOptionsStore.getState().setEncoding("mp3"); useAnalysisStore.getState().rebuildQualityOptions(); }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all ${
                    downloadType === "audio"
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span className="text-xs font-medium">Audio</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Only</span>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Quality</p>
              <Select value={selectedQuality} onValueChange={(v) => v && setSelectedQuality(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {qualityOptions.length > 0 && selectedQuality === qualityOptions[0].label
                      ? "Best for all"
                      : selectedQuality}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {qualityOptions.length > 0 ? (
                    qualityOptions.map((q, i) => (
                      <SelectItem key={q.value} value={q.label}>
                        {i === 0 ? "Best for all" : q.label}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="best">Best for all</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="480p">480p</SelectItem>
                      <SelectItem value="360p">360p</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full h-11 text-base font-medium"
            disabled={count === 0 || isDownloading || !selectedQuality}
            onClick={startPlaylistDownload}
          >
            {isDownloading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                Downloading...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download Selected ({count})
              </span>
            )}
          </Button>
        </>
      )}

      {phase === "completed" && isDownloading === false && (
        <Button
          className="w-full h-11 text-base font-medium"
          variant="secondary"
          onClick={() => useAnalysisStore.getState().setPhase('playlist')}
        >
          <span className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Download More
          </span>
        </Button>
      )}
    </div>
  );
}
