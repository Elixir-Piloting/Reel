import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDownloadStore } from "@/stores/download-store";
import { analyzeUrl as analyzeUrlApi, listFormats } from "@/lib/tauri";

export function UrlInput() {
  const { url, setUrl, setMetadata, setFormats, setSelectedFormatId, setError } = useDownloadStore();
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const meta = await analyzeUrlApi(url.trim());
      setMetadata(meta);
      const formats = await listFormats(url.trim());
      setFormats(formats);
      if (formats.length > 0) {
        setSelectedFormatId(formats[0].format_id);
      }
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Failed to analyze URL");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Paste YouTube URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
        className="flex-1"
      />
      <Button onClick={handleAnalyze} disabled={analyzing || !url.trim()}>
        {analyzing ? "Analyzing..." : "Analyze"}
      </Button>
    </div>
  );
}
