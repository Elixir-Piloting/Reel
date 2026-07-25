import { FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useOptionsStore } from "@/stores/options-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { dataService } from "@/shared/lib/data-service";
import { useSettingsStore } from "@/stores/settings-store";

const EXT_MAP: Record<string, string> = {
  mp4_h264: "mp4", mp4_h265: "mp4", mkv: "mkv", webm: "webm",
  mp3: "mp3", m4a: "m4a", opus: "opus", flac: "flac", wav: "wav",
};

export function DestinationSelector() {
  const outputDir = useOptionsStore((s) => s.outputDir);
  const setOutputDir = useOptionsStore((s) => s.setOutputDir);
  const downloadType = useOptionsStore((s) => s.downloadType);
  const encoding = useOptionsStore((s) => s.encoding);
  const filename = useOptionsStore((s) => s.filename);
  const metadata = useAnalysisStore((s) => s.metadata);
  const settings = useSettingsStore((s) => s.settings);

  const dir = outputDir || settings.default_download_folder;
  const ext = EXT_MAP[encoding] || (downloadType === "audio" ? "mp3" : "mp4");
  const effectiveName = (filename || metadata?.title || "video").replace(/[\\/:*?"<>|]/g, "_");
  const fullPath = dir ? `${dir}\\${effectiveName}.${ext}` : "";

  const handleBrowse = async () => {
    const d = await dataService.browseFolder();
    if (d) setOutputDir(d);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">Save To</Label>
      <div className="flex gap-2">
        <Input
          value={fullPath}
          readOnly
          className="flex-1 text-sm h-9 font-mono"
          placeholder="Select download folder..."
        />
        <Button
          variant="outline"
          onClick={handleBrowse}
          className="h-9 shrink-0"
        >
          <FolderOpen className="h-4 w-4 mr-1" />
          Browse
        </Button>
      </div>
    </div>
  );
}
