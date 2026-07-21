import { ClipboardPaste, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAnalysisStore } from "@/stores/analysis-store";

export function UrlInput() {
  const url = useAnalysisStore((s) => s.url);
  const setUrl = useAnalysisStore((s) => s.setUrl);
  const analyzeUrl = useAnalysisStore((s) => s.analyzeUrl);
  const phase = useAnalysisStore((s) => s.phase);
  const isAnalyzing = phase === "analyzing";

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        setTimeout(() => analyzeUrl(), 50);
      }
    } catch {}
  };

  const handleInputPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.trim()) {
      setUrl(pasted.trim());
      e.preventDefault();
      setTimeout(() => analyzeUrl(), 50);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          placeholder="Paste YouTube URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={handleInputPaste}
          className="flex-1 pr-10"
        />
        {isAnalyzing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <button
        onClick={handlePaste}
        disabled={isAnalyzing}
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        title="Paste from clipboard"
      >
        <ClipboardPaste className="h-4 w-4" />
      </button>
    </div>
  );
}
