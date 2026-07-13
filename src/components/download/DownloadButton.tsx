import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDownloadStore } from "@/stores/download-store";
import { useSettingsStore } from "@/stores/settings-store";
import { enqueueDownload, browseFolder } from "@/lib/tauri";
import { useState } from "react";

export function DownloadButton() {
  const {
    url, filename, outputDir, selectedFormatId,
    downloadType, premiereMode, startTime, endTime, metadata, setOutputDir, setError,
  } = useDownloadStore();
  const { settings } = useSettingsStore();
  const [downloading, setDownloading] = useState(false);

  const handleBrowse = async () => {
    const dir = await browseFolder();
    if (dir) setOutputDir(dir);
  };

  const handleDownload = async () => {
    if (!url || !selectedFormatId) return;
    const dir = outputDir || settings.default_download_folder;
    if (!dir) {
      setError("Please select a download folder");
      return;
    }
    setDownloading(true);
    try {
      await enqueueDownload({
        url,
        format_id: selectedFormatId,
        filename: filename || metadata?.title || "video",
        output_dir: dir,
        start_time: startTime || null,
        end_time: endTime || null,
        premiere_mode: premiereMode,
        download_type: downloadType,
      });
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">Save Location</Label>
        <div className="flex gap-2">
          <Input
            value={outputDir || settings.default_download_folder}
            readOnly
            className="flex-1 text-sm h-9"
            placeholder="Select download folder..."
          />
          <Button variant="outline" onClick={handleBrowse} className="h-9 whitespace-nowrap">
            Browse
          </Button>
        </div>
      </div>
      <Button onClick={handleDownload} disabled={downloading || !url} size="lg" className="h-9">
        {downloading ? "Adding..." : "Download"}
      </Button>
    </div>
  );
}
