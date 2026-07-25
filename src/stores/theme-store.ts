import { create } from "zustand";

export type Theme = "system" | "light" | "dark";

interface ThemeStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

function loadTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("reel-theme") as Theme) ?? "system";
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: loadTheme(),
  setTheme: (t) => {
    localStorage.setItem("reel-theme", t);
    set({ theme: t });
  },
}));
