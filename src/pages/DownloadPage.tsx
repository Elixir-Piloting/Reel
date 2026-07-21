import { useAnalysisStore } from "@/stores/analysis-store";
import { useOptionsStore } from "@/stores/options-store";
import { useDownloadExecutionStore } from "@/stores/download-execution-store";
import { usePlaylistStore } from "@/stores/playlist-store";
import { UrlInput } from "@/features/url-input";
import { VideoInfo } from "@/features/video-info";
import { DownloadTypeSelector, QualitySelector, RangeSelector, EncodingSelector, DestinationSelector } from "@/features/download-options";
import { DownloadProgress } from "@/features/download-execution";
import { PlaylistSelector } from "@/features/playlist";
import { PresetSelector } from "@/features/presets";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw } from "lucide-react";

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
  const isDownloading = useDownloadExecutionStore((s) => s.isDownloading);
  const startDownload = useDownloadExecutionStore((s) => s.startDownload);
  const reset = useDownloadExecutionStore((s) => s.reset);
  const itemProgress = usePlaylistStore((s) => s.itemProgress);

  const isPlaylistDownload = Object.keys(itemProgress).length > 0;
  const canDownload = phase === "ready" && !!outputDir && !isDownloading;

  return (
    <div className="max-w-2xl mx-auto space-y-5 py-4">
      <UrlInput />

      <AnimatedSection show={phase === "analyzing" || phase === "ready"}>
        {(phase === "analyzing" || phase === "ready") && <VideoInfo />}
      </AnimatedSection>

      <AnimatedSection show={phase === "ready"}>
        {phase === "ready" && (
          <>
            <DownloadTypeSelector />
            <QualitySelector />
            <RangeSelector />
            <EncodingSelector />
            <PresetSelector />
            <DestinationSelector />
          </>
        )}
      </AnimatedSection>

      <AnimatedSection show={phase === "playlist" || (isPlaylistDownload && (phase === "downloading" || phase === "completed"))}>
        {(phase === "playlist" || (isPlaylistDownload && (phase === "downloading" || phase === "completed"))) && (
          <PlaylistSelector />
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
              Download
            </span>
          </Button>
        )}
      </AnimatedSection>

      {(phase === "downloading" || phase === "completed" || phase === "error") && (
        <AnimatedSection show={true}>
          <DownloadProgress big={phase === "downloading" || phase === "completed"} />
        </AnimatedSection>
      )}

      <AnimatedSection show={phase === "error"}>
        {phase === "error" && error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/80 shrink-0">&times;</button>
          </div>
        )}
      </AnimatedSection>

      <AnimatedSection show={phase === "completed"}>
        {phase === "completed" && (
          <Button className="w-full h-11 text-base font-medium" onClick={reset}>
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download More
            </span>
          </Button>
        )}
      </AnimatedSection>

      <AnimatedSection show={phase === "error"}>
        {phase === "error" && (
          <Button className="w-full h-11 text-base font-medium" variant="secondary" onClick={reset}>
            <span className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Try Again
            </span>
          </Button>
        )}
      </AnimatedSection>
    </div>
  );
}
