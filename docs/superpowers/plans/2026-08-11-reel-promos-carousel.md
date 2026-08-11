# Reel Promos Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a carousel of promo cards at the bottom of the Reel sidebar, directly above the theme picker, driven by a `promos.json` feed served from the repo's public raw URL.

**Architecture:** A `promos.json` file at the repo root is the content feed (public raw URL, same pattern as the existing `update.json`). A self-contained `PromoCarousel` React component fetches it on mount, filters to active promos, and renders a single-card carousel (auto-advance with hover pause, dots + arrows). The component is mounted in `RootLayout` above the `ThemePicker`. The webview CSP gains `connect-src https:` so `fetch()` can reach the raw URL.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite, Tauri v2, `@tauri-apps/plugin-opener` (already installed), `@phosphor-icons/react`.

## Global Constraints

- Feed URL (exact): `https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json`
- JSON contract (exact shape, top-level array):
  ```json
  [
    { "type": "image", "media_url": "https://...", "title": "...", "body": "...", "link": "https://...", "active": true }
  ]
  ```
  Only entries with `active !== false` are rendered. `media_url`/`body`/`type` are optional; `title` and `link` are required. `type` is `"image"` (default) or `"video"`; both use the single `media_url` field — `"video"` entries autoplay muted (no controls), advancing on `ended`, while `"image"` entries wait 6s.
- Carousel: one card at a time; auto-advance every 6s; pause on hover; dot indicators + prev/next arrows; a single active promo renders as a static card with no controls.
- Card layout: a `div` with `border-4 border-background rounded-md` and `bg-surface`. The media (image or video, `w-full aspect-[4/3] rounded-md object-cover`) is at the top; a text `div` (`mt-2 px-3 pb-3`) below holds the title (text-sm, semibold) and body (text-xs, muted). No gradient overlay, no external-link icon. The whole card is clickable. On media failure the image is hidden or the video skipped. The feed fetch uses `cache: "no-store"`.
- Whole card is clickable → `openUrl(promo.link)` from `@tauri-apps/plugin-opener`.
- On fetch failure, invalid JSON, or zero active promos the section renders `null` (hidden entirely — no placeholder, no toast).
- CSP: add `connect-src https:` (fetch) and `media-src https:` (video promos) to the existing CSP in `src-tauri/tauri.conf.json`. No other capabilities/permissions change.
- No new dependencies.
- No test framework is configured in this repo. Verification is via `npx tsc --noEmit`, `npm run build`, and manual checks in `npm run tauri dev`.

---

### Task 1: Create and publish `promos.json`

**Files:**
- Create: `promos.json`

**Interfaces:**
- Produces: `promos.json` at repo root, a top-level array of promo objects matching the contract above. Consumed by `PromoCarousel` (Task 3) at the raw URL `https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json`.

- [ ] **Step 1: Create `promos.json`**

Create `promos.json` at the repo root:

```json
[
  {
    "type": "image",
    "media_url": "https://yoursite.com/promos/murmur.png",
    "title": "Try Murmur",
    "body": "Hands-free voice dictation for Windows.",
    "link": "https://murmur.freyo.app",
    "active": true
  }
]
```

- [ ] **Step 2: Verify the JSON parses**

Run:

```powershell
Get-Content promos.json -Raw | ConvertFrom-Json
```

Expected: an array with one object (`type`, `media_url`, `title`, `body`, `link`, `active`) — no parse error.

- [ ] **Step 3: Commit and push to master**

```bash
git add promos.json
git commit -m "feat: add promos.json promo feed"
git push origin master
```

Expected: commit created and pushed to `origin/master`.

- [ ] **Step 4: Verify the raw URL serves the file**

Run:

```powershell
(Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json").StatusCode
```

Expected: `200` and the body contains `"title": "Try Murmur"`.

---

### Task 2: Allow the webview to fetch the feed (CSP)

**Files:**
- Modify: `src-tauri/tauri.conf.json:25` (the `security.csp` string)

**Interfaces:**
- Consumes: nothing.
- Produces: a CSP that permits webview `fetch()` to `https:` URLs. Required by the `fetch()` in `PromoCarousel` (Task 3). Runtime proof lands in Task 4.

- [ ] **Step 1: Add `connect-src https:` to the CSP**

In `src-tauri/tauri.conf.json`, change the `csp` value (line 25) from:

```json
"csp": "default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline';"
```

to:

```json
"csp": "default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; connect-src https:;"
```

- [ ] **Step 2: Verify the config still parses**

Run:

```powershell
$t = Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json; $t.app.security.csp
```

Expected: prints the updated CSP string containing `connect-src https:`. No JSON parse error.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore: allow webview fetch to https for promos feed"
```

---

### Task 3: Build the `PromoCarousel` component

**Files:**
- Create: `src/features/promos/PromoCarousel.tsx`

**Interfaces:**
- Consumes: `promos.json` feed from the raw URL (Task 1); CSP `connect-src https:` (Task 2).
- Produces: default-exported `PromoCarousel: React.FC` component (no props). Renders `null` until an active promo list is loaded. Mounted by `RootLayout` (Task 4).

- [ ] **Step 1: Write the component**

Create `src/features/promos/PromoCarousel.tsx`:

```tsx
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";

const PROMOS_URL =
  "https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json";
const ADVANCE_MS = 6000;

type Promo = {
  image_url?: string;
  title: string;
  body?: string;
  link: string;
  active?: boolean;
};

function isPromo(value: unknown): value is Promo {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Promo;
  return typeof p.title === "string" && typeof p.link === "string";
}

export function PromoCarousel() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [hidden, setHidden] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(PROMOS_URL, { signal: controller.signal });
        if (!res.ok) return;
        const data: unknown = await res.json();
        const active = Array.isArray(data)
          ? data.filter((item): item is Promo => isPromo(item) && item.active !== false)
          : [];
        if (active.length === 0) return;
        setPromos(active);
        setHidden(false);
      } catch {
        // Network/CSP failure -> keep the section hidden.
      }
    })();
    return () => controller.abort();
  }, []);

  const count = promos.length;
  const promo = promos[index] ?? promos[0];

  useEffect(() => {
    if (hidden || count < 2 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearInterval(id);
  }, [hidden, count, paused]);

  if (hidden || !promo) return null;

  return (
    <div
      className="promo-carousel relative flex flex-col gap-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <button
        type="button"
        onClick={() => openUrl(promo.link).catch(() => {})}
        className="group flex w-full flex-col overflow-hidden rounded-lg border-2 border-background bg-surface inset-highlight text-left transition-all hover:bg-surface-overlay hover:shadow-soft cursor-pointer"
        title={promo.title}
      >
        {promo.image_url && (
          <img
            src={promo.image_url}
            alt=""
            className="h-24 w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <span className="flex flex-col gap-0.5 p-3">
          <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
            {promo.title}
            <ArrowSquareOut className="size-3.5 text-muted-foreground transition-colors group-hover:text-accent" weight="bold" />
          </span>
          {promo.body && (
            <span className="text-xs leading-normal text-muted-foreground">
              {promo.body}
            </span>
          )}
        </span>
      </button>

      {count > 1 && (
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            aria-label="Previous promo"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="flex size-6 items-center justify-center rounded-md border-2 border-background bg-surface text-muted-foreground transition-all hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="size-3.5" weight="bold" />
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Promo dots">
            {promos.map((p, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Promo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  i === index
                    ? "w-4 bg-accent accent-glow"
                    : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next promo"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="flex size-6 items-center justify-center rounded-md border-2 border-background bg-surface text-muted-foreground transition-all hover:text-foreground cursor-pointer"
          >
            <ArrowRight className="size-3.5" weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}

export default PromoCarousel;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/promos/PromoCarousel.tsx
git commit -m "feat: add promos carousel component"
```

---

### Task 4: Mount the carousel in the sidebar

**Files:**
- Modify: `src/components/layout/RootLayout.tsx:3-10` (imports) and `:101-103` (the `mt-auto` block)

**Interfaces:**
- Consumes: `PromoCarousel` (default export from Task 3).
- Produces: the carousel rendered in the sidebar, directly above the `ThemePicker`.

- [ ] **Step 1: Import `PromoCarousel`**

In `src/components/layout/RootLayout.tsx`, add after the existing imports (e.g. after the `ThemePicker` import on line 6):

```tsx
import { PromoCarousel } from "@/features/promos/PromoCarousel";
```

- [ ] **Step 2: Render it above the theme picker**

Replace the `mt-auto` block (currently lines 101-103):

```tsx
            <div className="mt-auto">
              <ThemePicker size="sm" />
            </div>
```

with:

```tsx
            <div className="mt-auto flex flex-col gap-2">
              <PromoCarousel />
              <ThemePicker size="sm" />
            </div>
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run build`
Expected: `tsc` and `vite build` both succeed (exit 0, `dist/` produced).

- [ ] **Step 4: Manual verification in the dev app**

Run: `npm run tauri dev`

In the app window, confirm:
1. The sidebar bottom shows the "Try Murmur" card above the theme picker.
2. The card is clickable and opens `https://murmur.freyo.app` in the default browser.
3. With a single active promo, there are no arrows/dots (static card).
4. Temporarily add a second active entry to `promos.json`, `git push origin master`, and restart the dev app — verify the carousel shows one card, auto-advances after ~6s, pauses on hover, and that the dots and prev/next arrows navigate between the two promos. Then remove the temporary entry and commit.
5. Hovering the card shows the hover style (`bg-surface-overlay` + `shadow-soft`).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/RootLayout.tsx
git commit -m "feat: show promos carousel in sidebar above theme picker"
```

---

## Self-Review Notes

- **Spec coverage:** `promos.json` contract (Task 1), CSP (Task 2), component with carousel behavior + graceful hide (Task 3), sidebar placement above theme toggle (Task 4). Spec's out-of-scope items (auth, periodic refresh, analytics, dismiss) are intentionally absent.
- **Type consistency:** `Promo`, `PROMOS_URL`, `ADVANCE_MS`, `isPromo`, and the default-exported `PromoCarousel` are defined once in Task 3 and referenced consistently in Task 4.
