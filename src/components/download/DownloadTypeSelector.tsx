import { Label } from "@/components/ui/label";
import { useDownloadStore } from "@/stores/download-store";

export function DownloadTypeSelector() {
  const { downloadType, setDownloadType } = useDownloadStore();

  return (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">Download Type</Label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="download-type"
            value="video+audio"
            checked={downloadType === "video+audio"}
            onChange={() => setDownloadType("video+audio")}
            className="accent-primary"
          />
          <span className="text-sm">Video + Audio</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="download-type"
            value="audio-only"
            checked={downloadType === "audio-only"}
            onChange={() => setDownloadType("audio-only")}
            className="accent-primary"
          />
          <span className="text-sm">Audio Only</span>
        </label>
      </div>
    </div>
  );
}
