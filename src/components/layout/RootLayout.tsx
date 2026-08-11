import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { TitleBar } from "./TitleBar";
import { DownloadSimple, Gear, House } from "@phosphor-icons/react";
import { Toaster } from "@/components/ui/sonner";
import { ThemePicker } from "@/components/ui/theme-picker";
import { PromoCarousel } from "@/features/promos/PromoCarousel";
import { useThemeStore, type Theme } from "@/stores/theme-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useBinaryStatusStore } from "@/stores/binary-status-store";
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
    useBinaryStatusStore.getState().refresh();
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
    { icon: <House className="size-5" weight="fill" />, label: "Home", action: () => navigate("/"), active: location.pathname === "/" },
    { icon: <DownloadSimple className="size-5" weight="fill" />, label: "Downloads", action: () => navigate("/downloads"), active: location.pathname === "/downloads", badge: activeCount > 0 ? activeCount : undefined },
    { icon: <Gear className="size-5" weight="fill" />, label: "Settings", action: () => navigate("/settings"), active: location.pathname === "/settings" },
  ];

  return (
    <>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <TitleBar />

        <div className="flex flex-1 min-h-0">
          <aside className="w-72 shrink-0 ml-3 mr-2 mb-2 flex flex-col gap-1 p-2 rounded-xl border-2 border-background bg-surface clay-sunken">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className={`relative flex items-center gap-3 w-full h-11 rounded-md pl-4 text-sm font-medium border-2 border-background bg-surface inset-highlight transition-all cursor-pointer ${
                  item.active
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-surface-overlay hover:text-foreground"
                }`}
                title={item.label}
              >
                {item.active && (
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-[70%] w-1 rounded-r-full bg-accent accent-glow" />
                )}
                {item.icon}
                <span>{item.label}</span>
                {item.badge != null && (
                  <span className="ml-auto mr-2 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
            <div className="mt-auto flex flex-col gap-2">
              <PromoCarousel />
              <ThemePicker size="sm" />
            </div>
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
