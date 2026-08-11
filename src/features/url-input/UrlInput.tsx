import { ClipboardPaste, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAnalysisStore } from "@/stores/analysis-store";
import { logger } from "@/shared/lib/logger";
import { useUrlHistory } from "./useUrlHistory";
import { useState, useRef, useEffect } from "react";

export function UrlInput() {
  const url = useAnalysisStore((s) => s.url);
  const setUrl = useAnalysisStore((s) => s.setUrl);
  const analyzeUrl = useAnalysisStore((s) => s.analyzeUrl);
  const phase = useAnalysisStore((s) => s.phase);
  const metadata = useAnalysisStore((s) => s.metadata);
  const isAnalyzing = phase === "analyzing";
  const { history, addEntry } = useUrlHistory();
  const [showHistory, setShowHistory] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (metadata && url) {
      addEntry(url, metadata.title);
    }
  }, [metadata, url, addEntry]);

  useEffect(() => {
    setShowHistory(focused && history.length > 0);
  }, [focused, history]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        await analyzeUrl(text.trim());
      }
    } catch { logger.warn("Clipboard read failed"); }
  };

  const handleInputPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.trim()) {
      setUrl(pasted.trim());
      e.preventDefault();
      setTimeout(() => analyzeUrl(pasted.trim()), 0);
    }
  };

  const handleHistoryClick = (entry: { url: string }) => {
    setUrl(entry.url);
    setShowHistory(false);
    analyzeUrl(entry.url);
  };

  return (
    <div className="flex gap-2">
      <div ref={containerRef} className="relative flex-1">
        <Input
          placeholder="Paste YouTube URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={handleInputPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 pr-10"
        />
        {isAnalyzing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {showHistory && (
          <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-lg border-2 border-background bg-surface inset-highlight shadow-soft max-h-60 overflow-y-auto">
            {history.map((entry) => (
              <button
                key={entry.url}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleHistoryClick(entry);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors truncate"
              >
                <span className="text-muted-foreground mr-2">↻</span>
                {entry.title || entry.url}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={handlePaste}
        disabled={isAnalyzing}
        className="inline-flex items-center justify-center rounded-lg border-2 border-background bg-surface px-3 text-muted-foreground inset-highlight hover:bg-surface-overlay hover:text-foreground transition-all disabled:opacity-50"
        title="Paste from clipboard"
      >
        <ClipboardPaste className="h-4 w-4" />
      </button>
    </div>
  );
}
