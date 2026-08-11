import { useAnalysisStore } from "@/stores/analysis-store";
import { useOptionsStore } from "@/stores/options-store";
import { useDownloadExecutionStore } from "@/stores/download-execution-store";
import { usePlaylistStore } from "@/stores/playlist-store";
import { useSettingsStore } from "@/stores/settings-store";
import { UrlInput } from "@/features/url-input";
import { VideoInfo } from "@/features/video-info";
import { DownloadTypeSelector, QualitySelector, RangeSelector, EncodingSelector, DestinationSelector } from "@/features/download-options";
import { PlaylistSelector } from "@/features/playlist";
import { DownloadProgress } from "@/features/download-execution";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw } from "lucide-react";
import { formatDuration, formatDate } from "@/lib/utils";
import { dataService } from "@/shared/lib/data-service";

function AnimatedSection({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`transition-all duration-300 ease-in-out ${
        show ? "opacity-100 max-h-[5000px]" : "opacity-0 max-h-0 overflow-hidden"
      }`}
    >
      {children}
    </div>
  );
}

export function DownloadPage() {
  const phase = useAnalysisStore((s) => s.phase);
  const metadata = useAnalysisStore((s) => s.metadata);
  const error = useAnalysisStore((s) => s.error);
  const setError = useAnalysisStore((s) => s.setError);
  const outputDir = useOptionsStore((s) => s.outputDir);
  const selectedQuality = useOptionsStore((s) => s.selectedQuality);
  const settings = useSettingsStore((s) => s.settings);
  const isDownloading = useDownloadExecutionStore((s) => s.isDownloading);
  const startDownload = useDownloadExecutionStore((s) => s.startDownload);
  const reset = useDownloadExecutionStore((s) => s.reset);
  const itemProgress = usePlaylistStore((s) => s.itemProgress);

  const qualityOptions = useAnalysisStore((s) => s.qualityOptions);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [dirExists, setDirExists] = useState(true);
  const isPlaylistDownload = Object.keys(itemProgress).length > 0;
  const effectiveDir = outputDir || settings.default_download_folder || '';
  const hasFormats = qualityOptions.length > 0;
  const canDownload = phase === "ready" && !!effectiveDir && dirExists && !!selectedQuality;

  useEffect(() => {
    if (effectiveDir) {
      dataService.verifyOutputDir(effectiveDir).then(setDirExists);
    }
  }, [effectiveDir]);
  const selectedOpt = qualityOptions.find(o => o.label === selectedQuality);
  const sizeMatch = selectedOpt?.label.match(/\(([^)]+)\)/);
  const sizeStr = sizeMatch ? sizeMatch[1] : '';

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <UrlInput />

      <DownloadProgress retry={() => { const item = useDownloadExecutionStore.getState().downloadItem; if (item) dataService.retryDownload(item.id).then(() => { reset(); }); }} />

      <AnimatedSection show={phase === "analyzing"}>
        {phase === "analyzing" && <VideoInfo />}
      </AnimatedSection>

      <AnimatedSection show={phase === "ready"}>
        {phase === "ready" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
                  {metadata?.thumbnail_url && (
                    <img src={metadata.thumbnail_url} alt={metadata?.title} className={`w-full h-full object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0"}`} onLoad={() => setImgLoaded(true)} />
                  )}
                </div>
                <div className="space-y-1">
                  <h2 className="font-semibold text-base leading-tight line-clamp-2">{metadata?.title}</h2>
                  <p className="text-sm text-muted-foreground">{metadata?.channel}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{formatDuration(metadata?.duration || 0)}</span>
                    <span>{formatDate(metadata?.upload_date || '')}</span>
                  </div>
                </div>
                <RangeSelector />
              </div>
              <div className="space-y-4">
                <DownloadTypeSelector />
                <QualitySelector />
                <EncodingSelector />
              </div>
            </div>
            <DestinationSelector />
          </div>
        )}
      </AnimatedSection>

      <AnimatedSection show={phase === "playlist" || (isPlaylistDownload && (phase === "downloading" || phase === "completed"))}>
        {(phase === "playlist" || (isPlaylistDownload && (phase === "downloading" || phase === "completed"))) && (
          <PlaylistSelector />
        )}
      </AnimatedSection>

      <AnimatedSection show={phase === "ready"}>
        {phase === "ready" && !hasFormats && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">No downloadable formats found</p>
            <p className="text-xs text-muted-foreground mt-1">
              This video may be a livestream, members-only, or geo-blocked. Try a different URL.
            </p>
          </div>
        )}
      </AnimatedSection>

      <AnimatedSection show={phase === "ready"}>
        {phase === "ready" && (
          <Button
            className="w-full h-11 text-base font-medium"
            disabled={!canDownload}
            onClick={startDownload}
          >
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              {sizeStr ? `Download (${sizeStr})` : 'Download'}
            </span>
          </Button>
        )}
      </AnimatedSection>

      <AnimatedSection show={phase === "error"}>
        {phase === "error" && error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/80 shrink-0">&times;</button>
          </div>
        )}
      </AnimatedSection>

      {!isPlaylistDownload && (
        <AnimatedSection show={phase === "error"}>
          {phase === "error" && (
            <Button className="w-full h-11 text-base font-medium" variant="secondary" onClick={() => { reset(); useAnalysisStore.getState().reset(); }}>
              <span className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                Try Again
              </span>
            </Button>
          )}
        </AnimatedSection>
      )}
    </div>
  );
}
