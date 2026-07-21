import { useDownloadStore } from "@/stores/download-store";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function QualitySelector() {
  const { qualityOptions, selectedQuality, setSelectedQuality, downloadType } = useDownloadStore();

  if (qualityOptions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">Quality</Label>
      <Select value={selectedQuality} onValueChange={(v) => v && setSelectedQuality(v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select quality" />
        </SelectTrigger>
        <SelectContent>
          {qualityOptions.map((q) => (
            <SelectItem key={q.label} value={q.label}>
              {downloadType === "audio-only"
                ? q.label
                : `${q.label}${q.fps && q.fps > 30 ? ` ${q.fps}fps` : ""}${q.filesize ? ` (${(q.filesize / 1024 / 1024).toFixed(1)}MB)` : ""}`
              }
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
