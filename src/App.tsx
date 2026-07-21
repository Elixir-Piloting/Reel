import { useState, useEffect } from "react"
import { Download, Sun, Moon, Monitor } from "lucide-react"
import { DownloadPage } from "@/pages/DownloadPage"
import { Toaster } from "@/components/ui/sonner"
import { useSettingsStore } from "@/stores/settings-store"
import { useDownloadStore } from "@/stores/download-store"


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
  const { loadSettings } = useSettingsStore()
  const initProgressListener = useDownloadStore((s) => s.initProgressListener)

  useEffect(() => {
    loadSettings()
    const cleanup = initProgressListener()
    return () => cleanup()
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

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <Download className="size-4" />
            </div>
            <span className="text-base font-semibold">YTMate</span>
          </div>
          <div className="flex items-center gap-1">
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
      </div>
      <Toaster theme={theme} />
    </>
  )
}
