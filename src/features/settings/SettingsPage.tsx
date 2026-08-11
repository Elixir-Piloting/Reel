import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "@/stores/settings-store";
import { useBinaryStatusStore } from "@/stores/binary-status-store";
import { SettingsCard } from "@/components/ui/settings-card";
import { ThemePicker } from "@/components/ui/theme-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataService } from "@/shared/lib/data-service";
import type { ToolStatus } from "@/shared/lib/types";

export function SettingsPage() {
  const { settings, updateSettings, loaded } = useSettingsStore();
  const binary = useBinaryStatusStore((s) => s.status);
  const refreshBinary = useBinaryStatusStore((s) => s.refresh);

  useEffect(() => {
    refreshBinary();
  }, [refreshBinary]);

  if (!loaded) return null;

  const ytdlp = binary.ytdlp;
  const ffmpeg = binary.ffmpeg;

  return (
    <div className="space-y-6 w-full">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <SettingsCard title="Appearance">
        <ThemePicker />
      </SettingsCard>

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
          <ToggleSetting checked={settings.auto_update_ytdlp} onChange={(v) => updateSettings({ auto_update_ytdlp: v })} label="Auto-update yt-dlp on launch" />
          <ToggleSetting checked={settings.auto_convert_premiere} onChange={(v) => updateSettings({ auto_convert_premiere: v })} label="Auto-convert to Premiere-compatible" />
          <ToggleSetting checked={settings.show_all_formats} onChange={(v) => updateSettings({ show_all_formats: v })} label="Show all formats (not just best per quality)" />
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Download tools</span>
              <Button size="sm" variant="outline" onClick={async () => {
                await dataService.updateYtdlp().catch(() => {});
                await dataService.updateFfmpeg().catch(() => {});
                useBinaryStatusStore.getState().refresh();
              }}>
                Update now
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              yt-dlp: v{formatVersion(ytdlp)} ({statusLabel(ytdlp.state)})
            </p>
            <p className="text-xs text-muted-foreground">
              ffmpeg: v{formatVersion(ffmpeg)} ({statusLabel(ffmpeg.state)})
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Playlist">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Max concurrent downloads</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSettings({ max_concurrent_downloads: Math.max(1, settings.max_concurrent_downloads - 1) })}
                className="w-8 h-8 rounded-md border-2 border-background bg-surface text-sm text-muted-foreground inset-highlight hover:bg-surface-overlay hover:text-foreground flex items-center justify-center transition-all"
              >−</button>
              <span className="w-8 text-center text-sm tabular-nums">{settings.max_concurrent_downloads}</span>
              <button
                onClick={() => updateSettings({ max_concurrent_downloads: Math.min(10, settings.max_concurrent_downloads + 1) })}
                className="w-8 h-8 rounded-md border-2 border-background bg-surface text-sm text-muted-foreground inset-highlight hover:bg-surface-overlay hover:text-foreground flex items-center justify-center transition-all"
              >+</button>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Output">
        <div className="space-y-2">
          <Label>Filename pattern</Label>
          <Input value={(settings as any).filenamePattern || '{title}'} onChange={(e) => updateSettings({ filenamePattern: e.target.value } as any)} />
          <p className="text-caption text-muted-foreground">Supported: {'{title}'}, {'{channel}'}, {'{date}'}, {'{id}'}</p>
        </div>
      </SettingsCard>

      <UpdatesCard />
    </div>
  );
}

function UpdatesCard() {
  const [installed, setInstalled] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "current">("idle");
  const [latest, setLatest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setInstalled)
      .catch(() => setInstalled(null));
  }, []);

  useEffect(() => {
    setStatus("checking");
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          setLatest(update.version);
          setStatus("available");
        } else {
          setStatus("current");
        }
      } catch {
        setStatus("idle");
      }
    })();
  }, []);

  const scan = async () => {
    setStatus("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setLatest(update.version);
        setStatus("available");
      } else {
        setStatus("current");
      }
    } catch {
      setStatus("idle");
    }
  };

  const install = async () => {
    setBusy(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        emit("app:restart");
      } else {
        setStatus("current");
      }
    } catch {
      setStatus("idle");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title="Version & Updates">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-y-0.5">
          <span className="text-sm font-medium">Reel v{installed ?? "…"}</span>
          <span className="text-xs text-muted-foreground">
            {status === "checking" && "Checking for updates…"}
            {status === "available" && `Update available: v${latest}`}
            {status === "current" && "Up to date"}
            {status === "idle" && "Version info unavailable"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={scan} disabled={busy}>
            Check again
          </Button>
          {status === "available" && (
            <Button onClick={install} disabled={busy}>
              Restart & install
            </Button>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}

function statusLabel(state: ToolStatus["state"]): string {
  switch (state) {
    case "up_to_date": return "up to date";
    case "updating": return "updating…";
    case "stale": return "update available";
    case "failed": return "update failed";
    case "offline": return "offline — using current";
    case "missing": return "not found";
  }
}

function formatVersion(t: ToolStatus): string {
  return t.installed ?? (t.latest ? `→ ${t.latest}` : "…");
}

function ToggleSetting({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-[inset_0_2px_5px_2px_var(--inset-highlight)] ${
          checked ? "bg-accent" : "bg-surface-sunken"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-surface inset-highlight ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-sm group-hover:text-foreground transition-colors">{label}</span>
    </label>
  );
}
