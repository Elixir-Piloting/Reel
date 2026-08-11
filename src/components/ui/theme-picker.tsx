import { useId } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore, type Theme } from "@/stores/theme-store";

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemePicker({ size = "md", className }: { size?: "md" | "sm"; className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const groupName = useId();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`theme-picker${size === "sm" ? " theme-picker--sm" : ""}${className ? ` ${className}` : ""}`}
    >
      {options.map(({ value, label, icon: Icon }) => (
        <label key={value} className="theme-picker__option">
          <input
            type="radio"
            name={groupName}
            checked={theme === value}
            onChange={() => setTheme(value)}
          />
          <Icon className="theme-picker__icon" />
          <span className="theme-picker__text">{label}</span>
        </label>
      ))}
    </div>
  );
}