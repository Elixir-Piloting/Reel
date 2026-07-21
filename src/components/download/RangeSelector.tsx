import { useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOptionsStore } from "@/stores/options-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { formatTimeInput, timeToSeconds } from "@/lib/utils";

export function RangeSelector() {
  const startTime = useOptionsStore((s) => s.startTime);
  const endTime = useOptionsStore((s) => s.endTime);
  const setStartTime = useOptionsStore((s) => s.setStartTime);
  const setEndTime = useOptionsStore((s) => s.setEndTime);
  const metadata = useAnalysisStore((s) => s.metadata);
  const maxTime = metadata?.duration || 0;
  const trackRef = useRef<HTMLDivElement>(null);

  const pct = (v: number) => (maxTime > 0 ? (v / maxTime) * 100 : 0);
  const startPct = pct(startTime);
  const endPct = pct(endTime);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || maxTime <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickPct = (e.clientX - rect.left) / rect.width;
      const clickTime = Math.round(clickPct * maxTime);
      const distToStart = Math.abs(clickTime - startTime);
      const distToEnd = Math.abs(clickTime - endTime);
      if (distToStart <= distToEnd) {
        setStartTime(Math.max(0, Math.min(clickTime, endTime - 1)));
      } else {
        setEndTime(Math.min(maxTime, Math.max(clickTime, startTime + 1)));
      }
    },
    [startTime, endTime, maxTime, setStartTime, setEndTime]
  );

  if (!metadata) return null;

  return (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">Duration Range</Label>

      <div
        ref={trackRef}
        className="relative h-2 bg-secondary rounded-full cursor-pointer mt-3 mb-2"
        onClick={handleTrackClick}
      >
        <div
          className="absolute h-full bg-primary rounded-full"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background shadow cursor-grab active:cursor-grabbing"
          style={{ left: `${startPct}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const onMove = (ev: MouseEvent) => {
              if (!trackRef.current || maxTime <= 0) return;
              const rect = trackRef.current.getBoundingClientRect();
              const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
              const t = Math.round(p * maxTime);
              setStartTime(Math.max(0, Math.min(t, endTime - 1)));
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background shadow cursor-grab active:cursor-grabbing"
          style={{ left: `${endPct}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const onMove = (ev: MouseEvent) => {
              if (!trackRef.current || maxTime <= 0) return;
              const rect = trackRef.current.getBoundingClientRect();
              const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
              const t = Math.round(p * maxTime);
              setEndTime(Math.min(maxTime, Math.max(t, startTime + 1)));
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            value={formatTimeInput(startTime)}
            onChange={(e) => {
              const secs = timeToSeconds(e.target.value);
              setStartTime(Math.max(0, Math.min(secs, endTime - 1, maxTime)));
            }}
            className="h-8 text-sm text-center font-mono"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">to</span>
        <div className="flex-1">
          <Input
            value={formatTimeInput(endTime)}
            onChange={(e) => {
              const secs = timeToSeconds(e.target.value);
              setEndTime(Math.min(maxTime, Math.max(secs, startTime + 1)));
            }}
            className="h-8 text-sm text-center font-mono"
          />
        </div>
      </div>
    </div>
  );
}
