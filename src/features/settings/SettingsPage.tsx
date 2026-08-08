import { Sun, Moon, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore, type Theme } from "@/stores/theme-store";
import { SettingsCard } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="size-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="size-4" /> },
  { value: "system", label: "System", icon: <Monitor className="size-4" /> },
];

export function SettingsPage() {
  const { settings, updateSettings, loaded } = useSettingsStore();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  if (!loaded) return null;

  return (
    <div className="space-y-6 w-full">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <SettingsCard title="Appearance">
        <div className="flex gap-2">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                theme === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
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
        </div>
      </SettingsCard>

      <SettingsCard title="Playlist">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Max concurrent downloads</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSettings({ max_concurrent_downloads: Math.max(1, settings.max_concurrent_downloads - 1) })}
                className="w-7 h-7 rounded-md border border-input flex items-center justify-center text-sm hover:bg-accent transition-colors"
              >−</button>
              <span className="w-8 text-center text-sm tabular-nums">{settings.max_concurrent_downloads}</span>
              <button
                onClick={() => updateSettings({ max_concurrent_downloads: Math.min(10, settings.max_concurrent_downloads + 1) })}
                className="w-7 h-7 rounded-md border border-input flex items-center justify-center text-sm hover:bg-accent transition-colors"
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
    if (import.meta.env.DEV) return;
    getVersion()
      .then(setInstalled)
      .catch(() => setInstalled(null));
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;
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
    if (import.meta.env.DEV) return;
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
    if (import.meta.env.DEV) return;
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

function ToggleSetting({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          checked ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-sm group-hover:text-foreground transition-colors">{label}</span>
    </label>
  );
}
