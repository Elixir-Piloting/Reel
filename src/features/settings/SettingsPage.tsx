import { useSettingsStore } from "@/stores/settings-store";
import { SettingsCard } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsPage() {
  const { settings, updateSettings, loaded } = useSettingsStore();

  if (!loaded) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <SettingsCard title="Download Folder">
        <div className="flex gap-2">
          <Input value={settings.default_download_folder} readOnly className="flex-1" />
          <Button onClick={async () => {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const folder = await open({ directory: true, multiple: false, title: 'Select Download Folder' });
              if (folder && !Array.isArray(folder)) {
                await updateSettings({ default_download_folder: folder });
              }
            } catch (e) {
              console.error('Failed to open folder picker', e);
            }
          }}>
            Browse
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Download Defaults">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.auto_update_ytdlp} onChange={(e) => updateSettings({ auto_update_ytdlp: e.target.checked })} className="accent-primary" />
            <span className="text-sm">Auto-update yt-dlp on launch</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.auto_convert_premiere} onChange={(e) => updateSettings({ auto_convert_premiere: e.target.checked })} className="accent-primary" />
            <span className="text-sm">Auto-convert to Premiere-compatible</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.show_all_formats} onChange={(e) => updateSettings({ show_all_formats: e.target.checked })} className="accent-primary" />
            <span className="text-sm">Show all formats (not just best per quality)</span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title="Output">
        <div className="space-y-2">
          <Label>Filename pattern</Label>
          <Input value={(settings as any).filenamePattern || '{title}'} onChange={(e) => updateSettings({ filenamePattern: e.target.value } as any)} />
          <p className="text-caption text-muted-foreground">Supported: {'{title}'}, {'{channel}'}, {'{date}'}, {'{id}'}</p>
        </div>
      </SettingsCard>
    </div>
  );
}
