import { Label } from "@/components/ui/label";
import { useOptionsStore } from "@/stores/options-store";

export function DownloadTypeSelector() {
  const downloadType = useOptionsStore((s) => s.downloadType);
  const setDownloadType = useOptionsStore((s) => s.setDownloadType);

  return (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">Download Type</Label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="download-type"
            value="video"
            checked={downloadType === "video"}
            onChange={() => setDownloadType("video")}
            className="accent-primary"
          />
          <span className="text-sm">Video + Audio</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="download-type"
            value="audio"
            checked={downloadType === "audio"}
            onChange={() => setDownloadType("audio")}
            className="accent-primary"
          />
          <span className="text-sm">Audio Only</span>
        </label>
      </div>
    </div>
  );
}
