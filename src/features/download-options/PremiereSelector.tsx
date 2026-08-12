import { useOptionsStore } from "@/stores/options-store";
import { Label } from "@/components/ui/label";

export function PremiereSelector() {
  const premiereMode = useOptionsStore((s) => s.premiereMode);
  const setPremiereMode = useOptionsStore((s) => s.setPremiereMode);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">Premiere-compatible</Label>
      <button
        role="switch"
        aria-checked={premiereMode}
        onClick={() => setPremiereMode(!premiereMode)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-[inset_0_2px_5px_2px_var(--inset-highlight)] ${
          premiereMode ? "bg-accent" : "bg-surface-sunken"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-surface inset-highlight ring-0 transition-transform ${
            premiereMode ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
      <p className="text-xs text-muted-foreground">
        Re-encode to H.264/AAC after downloading for Adobe Premiere.
      </p>
      <p className="text-xs text-muted-foreground/80">
        Encoding can take a long time — turn this off if you don't need to import the video into Premiere Pro.
      </p>
    </div>
  );
}
