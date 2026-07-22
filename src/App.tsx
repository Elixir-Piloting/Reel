import { useState, useEffect, useRef } from "react"
import { Sun, Moon, Monitor, Settings, ArrowLeft } from "lucide-react"
import { DownloadSimple } from "@phosphor-icons/react"
import { DownloadPage } from "@/pages/DownloadPage"
import { SettingsPage } from "@/features/settings/SettingsPage"
import { HistoryPanel } from "@/features/download-history/HistoryPanel"
import { Toaster } from "@/components/ui/sonner"
import { useSettingsStore } from "@/stores/settings-store"
import { useDownloadExecutionStore } from "@/stores/download-execution-store"
import { dataService } from "@/shared/lib/data-service"


type Theme = "system" | "light" | "dark"

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else if (theme === "light") {
    root.classList.remove("dark")
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    root.classList.toggle("dark", prefersDark)
  }
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system"
  const stored = localStorage.getItem("ytmate-theme") as Theme | null
  return stored ?? "system"
}

const themes: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: "light", icon: <Sun className="size-4" />, label: "Light" },
  { value: "dark", icon: <Moon className="size-4" />, label: "Dark" },
  { value: "system", icon: <Monitor className="size-4" />, label: "System" },
]

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [showSettings, setShowSettings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [activeCount, setActiveCount] = useState(0)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const initProgressListener = useDownloadExecutionStore((s) => s.initProgressListener)
  const isDownloading = useDownloadExecutionStore((s) => s.isDownloading)
  const setDownloading = useDownloadExecutionStore((s) => s.setDownloading)

  useEffect(() => {
    loadSettings()
    const p = initProgressListener()
    const interval = setInterval(async () => {
      try {
        const q = await dataService.getQueue();
        const active = q.filter((i: any) => {
          const s = typeof i.status === 'string' ? i.status : '';
          return ['Queued', 'Downloading', 'Merging', 'Converting'].includes(s);
        });
        setActiveCount(active.length);
        if (active.length === 0 && useDownloadExecutionStore.getState().isDownloading) {
          useDownloadExecutionStore.getState().setDownloading(false);
        }
      } catch {}
    }, 3000);
    return () => { clearInterval(interval); p.then((fn) => fn()) }
  }, [])

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem("ytmate-theme", theme)
  }, [theme])

  useEffect(() => {
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      const handler = () => applyTheme("system")
      mq.addEventListener("change", handler)
      return () => mq.removeEventListener("change", handler)
    }
  }, [theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettings(false)
        setShowHistory(false)
      }
    }
    if (showSettings || showHistory) {
      document.addEventListener("keydown", onKey)
      return () => document.removeEventListener("keydown", onKey)
    }
  }, [showSettings, showHistory])

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 h-14 border-b border-border/40 bg-background/80 backdrop-blur-md px-6 flex items-center justify-between">
          <h1 className="text-heading font-semibold tracking-tight">YTMate</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowHistory(true)} className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors" title="Downloads">
              <DownloadSimple className="size-5" weight="bold" />
              {activeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{activeCount > 9 ? '9+' : activeCount}</span>
              )}
            </button>
            <button onClick={() => setShowSettings(true)} className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors" title="Settings">
              <Settings className="size-4" />
            </button>
            {themes.map((t) => (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={`inline-flex items-center justify-center rounded-md p-2 transition-colors ${
                  theme === t.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                title={t.label}
              >
                {t.icon}
              </button>
            ))}
          </div>
        </header>
        <main className="px-6 pb-8">
          <DownloadPage />
        </main>
        {showSettings && (
          <div className="fixed inset-0 z-[60] bg-background overflow-y-auto">
            <div className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3 flex items-center justify-between">
              <button onClick={() => setShowSettings(false)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <h1 className="absolute left-1/2 -translate-x-1/2 text-heading font-semibold">Settings</h1>
              <div className="w-16" />
            </div>
            <div className="px-6 pb-8">
              <SettingsPage />
            </div>
          </div>
        )}
        {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
      </div>
      <Toaster theme={theme} />
    </>
  )
}
