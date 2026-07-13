import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSettingsStore } from "@/stores/settings-store";
import { browseFolder, updateYtdlp } from "@/lib/tauri";

export function SettingsPage() {
  const { settings, loadSettings, updateSettings } = useSettingsStore();
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const handleBrowseDefault = async () => {
    const dir = await browseFolder();
    if (dir) {
      await updateSettings({ default_download_folder: dir });
    }
  };

  const handleUpdateYtdlp = async () => {
    setUpdating(true);
    setUpdateMsg("");
    try {
      const msg = await updateYtdlp();
      setUpdateMsg(msg);
    } catch (err: unknown) {
      setUpdateMsg(typeof err === "string" ? err : "Update failed");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Default Download Folder</Label>
            <div className="flex gap-2">
              <Input
                value={settings.default_download_folder}
                readOnly
                className="flex-1"
              />
              <Button variant="outline" onClick={handleBrowseDefault}>
                Browse
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="auto-update" className="cursor-pointer">Auto Update yt-dlp</Label>
            <Switch
              id="auto-update"
              checked={settings.auto_update_ytdlp}
              onCheckedChange={(v) => updateSettings({ auto_update_ytdlp: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="auto-convert" className="cursor-pointer">Auto Convert for Premiere</Label>
            <Switch
              id="auto-convert"
              checked={settings.auto_convert_premiere}
              onCheckedChange={(v) => updateSettings({ auto_convert_premiere: v })}
            />
          </div>

          <div className="pt-2 border-t space-y-2">
            <Button onClick={handleUpdateYtdlp} disabled={updating} variant="secondary">
              {updating ? "Updating..." : "Update yt-dlp"}
            </Button>
            {updateMsg && (
              <p className="text-xs text-muted-foreground">{updateMsg}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
