import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { TitleBar } from "./TitleBar";
import { DownloadSimple, House } from "@phosphor-icons/react";
import { Toaster } from "@/components/ui/sonner";
import { useThemeStore, type Theme } from "@/stores/theme-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useDownloadExecutionStore } from "@/stores/download-execution-store";
import { dataService } from "@/shared/lib/data-service";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const [activeCount, setActiveCount] = useState(0);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const initProgressListener = useDownloadExecutionStore((s) => s.initProgressListener);

  const isHome = location.pathname === "/";

  useEffect(() => {
    loadSettings();
    const p = initProgressListener();
    const interval = setInterval(async () => {
      try {
        const q = await dataService.getQueue();
        const active = q.filter((i: any) => {
          return ['Queued', 'Downloading', 'Merging', 'Converting', 'Paused'].includes(i.status);
        });
        setActiveCount(active.length);
        if (active.length === 0 && useDownloadExecutionStore.getState().isDownloading) {
          useDownloadExecutionStore.getState().setDownloading(false);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => { clearInterval(interval); p.then((fn) => fn()) };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const navItems = [
    { icon: <House className="size-5" weight="bold" />, label: "Home", action: () => navigate("/"), active: location.pathname === "/" },
    { icon: <DownloadSimple className="size-5" weight="bold" />, label: "Downloads", action: () => navigate("/downloads"), active: location.pathname === "/downloads", badge: activeCount > 0 ? activeCount : undefined },
    { icon: <Settings className="size-4" />, label: "Settings", action: () => navigate("/settings"), active: location.pathname === "/settings" },
  ];

  return (
    <>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <TitleBar />

        <div className="flex flex-1 min-h-0">
          <aside className="w-16 shrink-0 flex flex-col items-center gap-2 pt-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className={`relative flex items-center justify-center w-10 h-10 rounded-xl border-2 border-background transition-all ${
                  item.active
                    ? "bg-accent text-accent-foreground inset-highlight"
                    : "bg-surface text-muted-foreground inset-highlight hover:bg-surface-overlay hover:text-foreground"
                }`}
                title={item.label}
              >
                {item.icon}
                {item.badge != null && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] font-bold text-accent-foreground border-2 border-background">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </aside>

          <div className="flex-1 flex flex-col min-w-0 mr-3 mb-2">
            <div className="flex-1 rounded-xl border-2 border-background bg-surface clay-sunken overflow-y-auto">
              <div className="flex-1 w-full max-w-4xl mx-auto px-6 pb-8 pt-6">
                <Outlet />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Toaster theme={theme} />
    </>
  );
}
