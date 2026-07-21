import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Download, List, History, Settings, Sun, Moon, Monitor, CommandIcon } from "lucide-react"

type Theme = "system" | "light" | "dark"

const themes: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: "light", icon: <Sun className="size-4" />, label: "Light" },
  { value: "dark", icon: <Moon className="size-4" />, label: "Dark" },
  { value: "system", icon: <Monitor className="size-4" />, label: "System" },
]

export function AppSidebar({
  page,
  onNavigate,
  theme,
  onThemeChange,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  page: string
  onNavigate: (page: string) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!">
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">YTMate</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={[
            { title: "Download", url: "download", icon: <Download /> },
            { title: "Queue", url: "queue", icon: <List /> },
            { title: "History", url: "history", icon: <History /> },
          ]}
          currentPage={page}
          onNavigate={onNavigate}
        />
        <NavSecondary
          items={[
            { title: "Settings", url: "settings", icon: <Settings /> },
          ]}
          onNavigate={onNavigate}
          className="mt-auto"
        />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1 px-2 py-1">
              {themes.map((t) => (
                <Button
                  key={t.value}
                  variant={theme === t.value ? "default" : "ghost"}
                  size="icon"
                  className="size-8"
                  onClick={() => onThemeChange(t.value)}
                  title={t.label}
                >
                  {t.icon}
                </Button>
              ))}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
