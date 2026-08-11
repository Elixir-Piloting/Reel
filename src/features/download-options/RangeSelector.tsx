import { useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@base-ui/react/slider";
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

  useEffect(() => {
    if (metadata) {
      setStartTime(0);
      setEndTime(metadata.duration || 0);
    }
  }, [metadata?.webpage_url]);

  const handleValueChange = useCallback(
    (value: number | readonly number[]) => {
      const vals = value as number[];
      setStartTime(vals[0]);
      setEndTime(vals[1]);
    },
    [setStartTime, setEndTime],
  );

  if (!metadata) return null;

  const isLiveStream = !metadata.duration || metadata.duration === 0;

  if (isLiveStream) {
    return (
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Duration Range</Label>
        <p className="text-sm text-muted-foreground">Live stream — full duration will be downloaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 min-w-0">
      <Label className="text-sm text-muted-foreground">Duration Range</Label>

      <div className="w-full">
        <Slider.Root
          value={[startTime, endTime]}
          onValueChange={handleValueChange}
          min={0}
          max={maxTime}
          step={1}
          minStepsBetweenValues={1}
        >
          <Slider.Control>
            <Slider.Track className="relative h-2.5 w-full rounded-full border-2 border-background bg-surface-sunken shadow-[inset_0_2px_5px_2px_var(--inset-highlight)] cursor-pointer">
              <Slider.Indicator className="absolute h-full accent-gradient rounded-full" />
              <Slider.Thumb className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-accent border-2 border-background cursor-grab active:cursor-grabbing data-[focus-visible]:outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring data-[focus-visible]:ring-offset-2" />
              <Slider.Thumb className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-accent border-2 border-background cursor-grab active:cursor-grabbing data-[focus-visible]:outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring data-[focus-visible]:ring-offset-2" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
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
