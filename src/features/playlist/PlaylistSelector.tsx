import { useAnalysisStore } from "@/stores/analysis-store";
import { useOptionsStore } from "@/stores/options-store";
import { useDownloadExecutionStore } from "@/stores/download-execution-store";
import { usePlaylistStore } from "@/stores/playlist-store";
import { formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckSquare, Square, Download, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function PlaylistSelector() {
  const metadata = useAnalysisStore((s) => s.metadata);
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

  if (!metadata || entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">{metadata.playlist_title || "Playlist"}</h2>
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

        <div className="space-y-1 max-h-80 overflow-y-auto">
          {entries.map((entry, idx) => {
            const progressItem = itemProgress[idx];
            const isDownloaded = phase === "downloading" || phase === "completed";
            const status = progressItem?.status;

            return (
              <div
                key={idx}
                className={`flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors ${
                  phase === "playlist" ? "hover:bg-accent/50 cursor-pointer" : ""
                } ${status === "completed" ? "opacity-60" : ""} ${status === "failed" ? "bg-destructive/5" : ""}`}
              >
                {phase === "playlist" ? (
                  <input
                    type="checkbox"
                    checked={selectedIndices.includes(idx)}
                    onChange={() => toggleEntry(idx)}
                    className="accent-primary shrink-0"
                  />
                ) : (
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : status === "failed" ? (
                      <XCircle className="w-4 h-4 text-destructive" />
                    ) : status === "downloading" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                    )}
                  </span>
                )}

                <div className="relative w-20 shrink-0 aspect-video rounded overflow-hidden bg-muted">
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
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
                  <p className="text-xs text-muted-foreground">
                    {entry.duration > 0 ? formatDuration(entry.duration) : ""}
                    {isDownloaded && status && status !== "queued" && (
                      <span className="ml-2">
                        {status === "downloading" && progressItem ? `${Math.round(progressItem.progress)}%` : ""}
                        {status === "completed" ? "Downloaded" : ""}
                        {status === "failed" ? "Failed" : ""}
                      </span>
                    )}
                  </p>
                  {isDownloaded && status === "downloading" && progressItem && progressItem.progress > 0 && (
                    <div className="w-full h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressItem.progress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {phase === "playlist" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Download Type</label>
              <select
                value={downloadType}
                onChange={(e) => setDownloadType(e.target.value as "video" | "audio")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="video">Video + Audio</option>
                <option value="audio">Audio Only</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Quality</label>
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {qualityOptions.length > 0 ? (
                  qualityOptions.map((q) => (
                    <option key={q.label} value={q.label}>{q.label}</option>
                  ))
                ) : (
                  <>
                    <option value="best">Best</option>
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <Button
            className="w-full h-11 text-base font-medium"
            disabled={count === 0 || isDownloading}
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
    </div>
  );
}
