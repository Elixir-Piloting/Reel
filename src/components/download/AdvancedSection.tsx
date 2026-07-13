import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDownloadStore } from "@/stores/download-store";

export function AdvancedSection() {
  const [open, setOpen] = useState(false);
  const { startTime, endTime, setStartTime, setEndTime } = useDownloadStore();

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? "▼" : "▶"} Advanced
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="start-time" className="text-xs">Start Time</Label>
            <Input
              id="start-time"
              placeholder="00:00"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end-time" className="text-xs">End Time</Label>
            <Input
              id="end-time"
              placeholder="02:20"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
