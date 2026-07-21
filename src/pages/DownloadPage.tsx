import { useDownloadStore } from "@/stores/download-store";
import { UrlInput } from "@/components/download/UrlInput";
import { VideoInfo } from "@/components/download/VideoInfo";
import { DownloadTypeSelector } from "@/components/download/DownloadTypeSelector";
import { QualitySelector } from "@/components/download/QualitySelector";
import { RangeSelector } from "@/components/download/RangeSelector";
import { EncodingSelector } from "@/components/download/EncodingSelector";
import { PresetSelector } from "@/components/download/PresetSelector";
import { DestinationSelector } from "@/components/download/DestinationSelector";
import { DownloadProgress } from "@/components/download/DownloadProgress";
import { PlaylistSelector } from "@/components/download/PlaylistSelector";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw } from "lucide-react";

export function DownloadPage() {
  const {
    phase, metadata, error, outputDir, isDownloading,
    startDownload, reset, setError, playlistItemProgress,
  } = useDownloadStore();
  const dir = outputDir;
  const canDownload = phase === "ready" && !!dir && !isDownloading;
  const isPlaylistDownload = playlistItemProgress.length > 0;

  if (phase === "idle") {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <UrlInput />
      </div>
    );
  }

  if (phase === "analyzing") {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <UrlInput />
        <VideoInfo />
      </div>
    );
  }

  if (phase === "playlist") {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <UrlInput />
        <PlaylistSelector />
        <DownloadProgress />
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <UrlInput />
        <VideoInfo />
        <DownloadTypeSelector />
        <QualitySelector />
        <RangeSelector />
        <EncodingSelector />
        <PresetSelector />
        <DestinationSelector />
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
        <DownloadProgress />
      </div>
    );
  }

  if (phase === "downloading") {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <UrlInput />
        {isPlaylistDownload ? (
          <PlaylistSelector />
        ) : (
          <DownloadProgress big />
        )}
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <UrlInput />
        {isPlaylistDownload ? (
          <PlaylistSelector />
        ) : (
          <DownloadProgress big />
        )}
        <Button
          className="w-full h-11 text-base font-medium"
          onClick={reset}
        >
          <span className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download More
          </span>
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <UrlInput />
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/80 shrink-0">&times;</button>
          </div>
        )}
        <DownloadProgress />
        <Button
          className="w-full h-11 text-base font-medium"
          variant="secondary"
          onClick={reset}
        >
          <span className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Try Again
          </span>
        </Button>
      </div>
    );
  }

  return null;
}
