import { useAnalysisStore } from "@/stores/analysis-store";
import { useOptionsStore } from "@/stores/options-store";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function QualitySelector() {
  const qualityOptions = useAnalysisStore((s) => s.qualityOptions);
  const selectedQuality = useOptionsStore((s) => s.selectedQuality);
  const setSelectedQuality = useOptionsStore((s) => s.setSelectedQuality);
  const downloadType = useOptionsStore((s) => s.downloadType);

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
            <SelectItem key={q.value} value={q.label}>
              {q.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
