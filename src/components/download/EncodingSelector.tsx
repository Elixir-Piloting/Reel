import { useOptionsStore } from "@/stores/options-store";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VIDEO_ENCODINGS = [
  { value: "mp4_h264", label: "MP4 (H.264)" },
  { value: "mp4_h265", label: "MP4 (H.265/HEVC)" },
  { value: "mkv", label: "MKV" },
  { value: "webm", label: "WebM" },
];

const AUDIO_ENCODINGS = [
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A (AAC)" },
  { value: "opus", label: "Opus" },
  { value: "flac", label: "FLAC" },
  { value: "wav", label: "WAV" },
];

export function EncodingSelector() {
  const downloadType = useOptionsStore((s) => s.downloadType);
  const encoding = useOptionsStore((s) => s.encoding);
  const setEncoding = useOptionsStore((s) => s.setEncoding);
  const options = downloadType === "audio" ? AUDIO_ENCODINGS : VIDEO_ENCODINGS;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">Encoding</Label>
      <Select value={encoding} onValueChange={(v) => v && setEncoding(v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
