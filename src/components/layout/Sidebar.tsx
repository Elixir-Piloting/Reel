import { cn } from "@/lib/utils";
import { Download, List, History, Settings } from "lucide-react";

export type Page = "download" | "queue" | "history" | "settings";

interface Props {
  active: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; label: string; icon: typeof Download }[] = [
  { page: "download", label: "Download", icon: Download },
  { page: "queue", label: "Queue", icon: List },
  { page: "history", label: "History", icon: History },
  { page: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-56 border-r bg-card flex flex-col h-screen shrink-0">
      <div className="h-14 flex items-center px-5 border-b">
        <h1 className="font-semibold text-base tracking-tight">YTMate</h1>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              active === page
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
