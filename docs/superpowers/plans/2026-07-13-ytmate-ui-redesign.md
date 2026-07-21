# YTMate UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single-column feed with a sidebar navigation splitting the app into Download, Queue, History, and Settings pages.

**Architecture:** App.tsx holds a `useState<"download"|"queue"|"history"|"settings">` driving which page component renders. Sidebar is a separate `Sidebar.tsx` component. Queue and History share the same `useQueueStore` with different default filters. No router dependency.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4, lucide-react, Tauri v2 shell events

## Global Constraints

- All queue data lives in the same `useQueueStore`; History page just sets a different default filter
- Rust backend changes minimized: only `remove_from_queue` command and `format_id`/`download_type`/`has_audio` fields on `DownloadItem`
- `useState<Page>` in App.tsx for navigation — no react-router
- Sidebar: 48px collapsed, 200px expanded on hover, primary-color active indicator

---

### Task 1: Add retry/clear fields to Rust DownloadItem + remove_from_queue command

**Files:**
- Modify: `src-tauri/src/models/mod.rs` (DownloadItem struct)
- Modify: `src-tauri/src/commands/download.rs` (add remove_from_queue command)
- Modify: `src-tauri/src/lib.rs` (register command)

**Interfaces:**
- Consumes: existing `DownloadItem` struct
- Produces: `DownloadItem` with `format_id: String`, `download_type: String`, `has_audio: bool`; command `remove_from_queue(id: String) -> Result<bool, String>`

- [ ] **Add fields to DownloadItem**

```rust
// src-tauri/src/models/mod.rs
pub struct DownloadItem {
    // ...existing fields...
    pub format_id: String,
    pub download_type: String,
    pub has_audio: bool,
}
```

- [ ] **Populate fields in enqueue_download and item update events**

```rust
// In enqueue_download, add to item creation:
format_id: request.format_id.clone(),
download_type: format!("{:?}", request.download_type),
has_audio: request.has_audio,

// In emit_item_update — no change needed (already reads full item from queue)
```

- [ ] **Add remove_from_queue command**

```rust
// In download.rs
#[tauri::command]
pub async fn remove_from_queue(
    queue: State<'_, SharedQueue>,
    id: String,
) -> Result<bool, String> {
    let mut q = queue.lock().map_err(|e| e.to_string())?;
    q.remove(&id);
    Ok(true)
}
```

- [ ] **Register command in lib.rs**

```rust
// src-tauri/src/lib.rs invoke_handler
commands::download::remove_from_queue,
```

- [ ] **Verify Rust compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

---

### Task 2: Update TypeScript interfaces and queue store

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/stores/queue-store.ts`

**Interfaces:**
- Produces: `DownloadItem` with `format_id`, `download_type`, `has_audio` fields; store with `removeItem`, `retryItem` actions; `removeFromQueue` invoke wrapper

- [ ] **Add fields to DownloadItem interface**

```typescript
// src/lib/tauri.ts
export interface DownloadItem {
  // ...existing...
  format_id: string;
  download_type: string;
  has_audio: boolean;
}
```

- [ ] **Add removeFromQueue invoke wrapper**

```typescript
// src/lib/tauri.ts
export async function removeFromQueue(id: string): Promise<boolean> {
  return invoke("remove_from_queue", { id });
}
```

- [ ] **Update queue store with removeItem and retryItem**

```typescript
// src/stores/queue-store.ts — add to interface and create()
removeItem: async (id: string) => {
  await removeFromQueue(id);
  set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
},
retryItem: (id: string) => {
  const item = get().items.find((i) => i.id === id);
  if (!item) return;
  // Re-enqueue with stored request data
  enqueueDownload({
    url: item.url,
    format_id: item.format_id,
    filename: item.filename.replace(`.${item.ext}`, ""),
    output_dir: item.output_path,
    start_time: null,
    end_time: null,
    premiere_mode: false,
    download_type: item.download_type === "Audio" ? "Audio" : "Video",
    video_title: item.title,
    thumbnail_url: item.thumbnail_url,
    has_audio: item.has_audio,
  }).catch(() => {});
},
```

- [ ] **Add status helpers to utils.ts**

```typescript
// src/lib/utils.ts — add these functions:
export function getStatusType(status: unknown): string {
  if (typeof status === "string") return status;
  if (status && typeof status === "object") {
    const key = Object.keys(status as Record<string, string>)[0];
    return key || "Unknown";
  }
  return "Unknown";
}

export function getStatusError(status: unknown): string {
  if (typeof status === "string") return "";
  if (status && typeof status === "object") {
    const obj = status as Record<string, string>;
    const key = Object.keys(obj)[0];
    return key ? obj[key] : "";
  }
  return "";
}

export function isItemFinished(status: unknown): boolean {
  const t = getStatusType(status);
  return t === "Completed" || t === "Failed" || t === "Cancelled";
}

export function isItemActive(status: unknown): boolean {
  const t = getStatusType(status);
  return ["Queued", "Downloading", "Merging", "Converting"].includes(t);
}
```

DownloadStatus::Failed(String) serializes as `{"Failed": "error message"}` (serde externally-tagged). These helpers normalize it so the rest of the UI deals with plain strings.

- [ ] **Update tauri.ts DownloadItem interface status type**

```typescript
// src/lib/tauri.ts — change status type
export interface DownloadItem {
  // ...
  status: string | Record<string, string>;
  // ...
}
```

- [ ] **Verify frontend build**

Run: `npm run build`

---

### Task 3: Sidebar component

**Files:**
- Create: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `currentPage: Page`, `onNavigate: (page: Page) => void` props
- Produces: rendered sidebar with 4 nav items

- [ ] **Create Sidebar component**

```typescript
// src/components/layout/Sidebar.tsx
import { Download, List, Clock, Cog } from "lucide-react";
import { cn } from "@/lib/utils";

type Page = "download" | "queue" | "history" | "settings";

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; label: string; icon: typeof Download }[] = [
  { page: "download", label: "Download", icon: Download },
  { page: "queue", label: "Queue", icon: List },
  { page: "history", label: "History", icon: Clock },
  { page: "settings", label: "Settings", icon: Cog },
];

export function Sidebar({ currentPage, onNavigate }: Props) {
  return (
    <aside className="group/sidebar fixed left-0 top-0 h-full w-12 hover:w-48 transition-all duration-200 z-50 bg-sidebar border-r flex flex-col pt-14">
      {navItems.map(({ page, label, icon: Icon }) => (
        <button
          key={page}
          onClick={() => onNavigate(page)}
          className={cn(
            "flex items-center gap-3 px-3 py-3 text-sm transition-colors w-full border-l-2",
            currentPage === page
              ? "border-primary bg-primary/5 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 whitespace-nowrap">
            {label}
          </span>
        </button>
      ))}
    </aside>
  );
}
```

Add sidebar CSS variables in `styles.css`:
```css
:root {
  --sidebar: hsl(0 0% 98%);
}
.dark {
  --sidebar: hsl(0 0% 10%);
}
```

- [ ] **Verify frontend build**

Run: `npm run build`

---

### Task 4: App.tsx with sidebar + page routing

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: Sidebar component, DownloadQueue removed (replaced by QueuePage/HistoryPage)
- Produces: App with sidebar and page routing

- [ ] **Update AppShell to accommodate sidebar**

```typescript
// src/components/layout/AppShell.tsx
interface Props {
  children: ReactNode;
}
export function AppShell({ children }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b h-12 flex items-center justify-between pl-14 pr-6">
        <h1 className="font-semibold text-sm">YTMate</h1>
      </header>
      <main className="pl-14 p-6 max-w-3xl mx-auto space-y-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Rewrite App.tsx**

```typescript
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { UrlInput } from "@/components/download/UrlInput";
import { MetadataCard } from "@/components/download/MetadataCard";
import { DownloadButton } from "@/components/download/DownloadButton";
import { DownloadTypeTabs } from "@/components/download/DownloadTypeTabs";
import { FormatSelector } from "@/components/download/FormatSelector";
import { PremiereToggle } from "@/components/download/PremiereToggle";
import { AdvancedSection } from "@/components/download/AdvancedSection";
import { QueuePage } from "@/pages/QueuePage";
import { HistoryPage } from "@/pages/HistoryPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { useSettingsStore } from "@/stores/settings-store";
import { useDownloadStore } from "@/stores/download-store";
import { useQueueStore } from "@/stores/queue-store";

type Page = "download" | "queue" | "history" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("download");
  const { loadSettings } = useSettingsStore();
  const { metadata, isAnalyzing } = useDownloadStore();
  const { initListener } = useQueueStore();
  const hasData = metadata !== null && !isAnalyzing;

  useEffect(() => {
    loadSettings();
    const cleanup = initListener();
    return () => cleanup();
  }, []);

  const renderPage = () => {
    switch (page) {
      case "download":
        return (
          <>
            <UrlInput />
            {isAnalyzing && !metadata && (
              <p className="text-sm text-muted-foreground animate-pulse">Analyzing...</p>
            )}
            <MetadataCard />
            {hasData && (
              <>
                <DownloadTypeTabs />
                <FormatSelector />
                <PremiereToggle />
                <AdvancedSection />
                <DownloadButton />
              </>
            )}
          </>
        );
      case "queue":
        return <QueuePage />;
      case "history":
        return <HistoryPage />;
      case "settings":
        return <SettingsPage />;
    }
  };

  return (
    <>
      <Sidebar currentPage={page} onNavigate={setPage} />
      <AppShell>{renderPage()}</AppShell>
    </>
  );
}
```

- [ ] **Remove DownloadQueue import** (no longer used in App.tsx)
- [ ] **Verify frontend build**

Run: `npm run build`

---

### Task 5: QueuePage with filters

**Files:**
- Create: `src/pages/QueuePage.tsx`

**Interfaces:**
- Consumes: `useQueueStore` (items array), `DownloadItemRow`
- Produces: Filtered, sorted list of queue items

- [ ] **Create QueuePage component**

```typescript
// src/pages/QueuePage.tsx
import { useState } from "react";
import { DownloadItemRow } from "@/components/queue/DownloadItem";
import { useQueueStore } from "@/stores/queue-store";
import { getStatusType, isItemActive, isItemFinished } from "@/lib/utils";

const filters = ["All", "Active", "Completed", "Failed"] as const;
type Filter = (typeof filters)[number];

function matches(status: unknown, filter: Filter) {
  if (filter === "All") return true;
  const t = getStatusType(status);
  if (filter === "Active") return isItemActive(status);
  if (filter === "Completed") return t === "Completed";
  if (filter === "Failed") return t === "Failed" || t === "Cancelled";
  return true;
}

export function QueuePage() {
  const { items } = useQueueStore();
  const [filter, setFilter] = useState<Filter>("All");

  const filtered = items
    .filter((i) => matches(i.status, filter))
    .sort((a, b) => {
      const aActive = isItemActive(a.status) ? 0 : 1;
      const bActive = isItemActive(b.status) ? 0 : 1;
      return aActive - bActive;
    });

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <DownloadItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Verify frontend build**

Run: `npm run build`

---

### Task 6: HistoryPage with filters and clear

**Files:**
- Create: `src/pages/HistoryPage.tsx`

**Interfaces:**
- Consumes: `useQueueStore` (items, removeItem), `DownloadItemRow`
- Produces: Filtered list of completed/failed/cancelled items with Clear All button

- [ ] **Create HistoryPage component**

```typescript
// src/pages/HistoryPage.tsx
import { DownloadItemRow } from "@/components/queue/DownloadItem";
import { useQueueStore } from "@/stores/queue-store";
import { Button } from "@/components/ui/button";
import { isItemFinished } from "@/lib/utils";

export function HistoryPage() {
  const { items, removeItem } = useQueueStore();

  const historyItems = items.filter((i) => isItemFinished(i.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{historyItems.length} items</p>
        {historyItems.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => historyItems.forEach((i) => removeItem(i.id))}>
            Clear All
          </Button>
        )}
      </div>
      {historyItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history</p>
      ) : (
        <div className="space-y-2">
          {historyItems.map((item) => (
            <DownloadItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Verify frontend build**

Run: `npm run build`

---

### Task 7: Update DownloadItem row with retry and error display

**Files:**
- Modify: `src/components/queue/DownloadItem.tsx`

**Interfaces:**
- Consumes: `item: DownloadItem` with new fields, `useQueueStore.retryItem`
- Produces: Row with retry button on failed items, error detail visible

- [ ] **Add retry button and error display**

```typescript
// src/components/queue/DownloadItem.tsx
// Add to imports:
import { RotateCcw } from "lucide-react";
import { useQueueStore } from "@/stores/queue-store";
import { getStatusType, getStatusError, isItemFinished } from "@/lib/utils";

// Inside component, replace isFinished:
const isFinished = isItemFinished(item.status);

// Get the store:
const { retryItem } = useQueueStore();

// After the cancel button section, add:
{getStatusType(item.status) === "Failed" && (
  <Button
    variant="ghost"
    size="icon"
    className="h-7 w-7 shrink-0"
    onClick={() => retryItem(item.id)}
    title="Retry download"
  >
    <RotateCcw className="h-4 w-4" />
  </Button>
)}

// Status label rendering — use getStatusType:
<span className={cn("text-xs shrink-0 ml-2", statusColors[getStatusType(item.status)] || "")}>
  {statusLabels[getStatusType(item.status)] || getStatusType(item.status)}
</span>

// Show/hide progress — use isItemActive/getStatusType:
{(isItemActive(item.status) || getStatusType(item.status) === "Converting") && (
  ...
)}

// Completed check:
{getStatusType(item.status) === "Completed" && <Progress value={100} className="h-1.5" />}

// Add error detail after filename:
{getStatusType(item.status) === "Failed" && (
  <p className="text-xs text-destructive truncate mt-0.5">{getStatusError(item.status)}</p>
)}
```

Note: `DownloadStatus::Failed(String)` serializes as `{"Failed":"error message"}` (serde externally-tagged). `getStatusType`/`getStatusError` from utils handle this.

- [ ] **Verify frontend build**

Run: `npm run build`

---

### Task 8: Port SettingsPage to pages directory

**Files:**
- Create: `src/pages/SettingsPage.tsx`
- Delete: `src/components/settings/SettingsPage.tsx` (or keep as redirect)

- [ ] **Create pages/SettingsPage.tsx** — Copy existing `src/components/settings/SettingsPage.tsx` verbatim
- [ ] **Delete old SettingsPage** — Remove `src/components/settings/SettingsPage.tsx`
- [ ] **Verify frontend build**

Run: `npm run build`

---

### Task 9: Full build verification

- [ ] **Check Rust compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Check frontend builds**

Run: `npm run build`

- [ ] **Run desktop app if possible**

Run: `cargo tauri dev`
