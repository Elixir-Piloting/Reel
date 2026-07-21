# YTMate Full Remediation — Execution Prompt

## What this is

You are an AI coding agent. This file is your sole briefing. You have never seen this project before. Everything you need to know about what to fix, why it's broken, and what "done" looks like is in this one file. Follow it. Do not improvise scope. Do not soften the work. Every section below identifies real problems in the actual codebase, names real files and real functions, and gives you concrete direction for the fix.

The product: **YTMate** — a Tauri v2 desktop application for downloading YouTube videos and audio via yt-dlp. Users paste a URL, optionally trim start/end times, pick quality/encoding, and download. Playlists are supported (analyzed once, then sequential per-item download). The app has a Rust backend (Tauri commands + yt-dlp sidecar) and a React + Tailwind CSS v4 + shadcn/ui (base-nova style) frontend using Zustand for state management.

## What's wrong

The app works end-to-end but feels like a scaffolding prototype that got shipped. Specifically:

- **UI is generic.** Every component is default shadcn styling with no design intent. Colors are flat. Typography is unconsidered. There are zero transitions, zero micro-interactions, no visual hierarchy beyond what Tailwind defaults provide. The dark theme is a half-measure (YouTube-inspired but inconsistent). The app looks like it was built by someone who installed shadcn and accepted all defaults.
- **UX is unclear.** Phase transitions are abrupt. There's no persistent queue/history. The download progress UI re-renders inconsistently. Playlist flow is confusing (options shown inside playlist view duplicate the "ready" phase). Error states vanish without user action. There's no feedback for long operations beyond a spinner.
- **Functionality is fragile.** Single sequential playlist downloads (no concurrency, no real queue). No write-audit of where files actually land. No retry-from-failure UI. No cancellation for playlist items (only whole-batch via brute-force kill). The `--embed-thumbnail` retry hack works but is opaque to the user.
- **Architecture is tangled.** A 580-line Zustand store holds everything — visualization logic, data fetching, UI state, download orchestration — in one flat namespace. The PlaylistSelector duplicates options that also appear in the "ready" phase view. Components reach directly into stores via `useStore()` calls scattered everywhere, making testability and refactoring nearly impossible.
- **Dead code still lingers.** Empty component directories (`components/layout/`, `components/queue/`, `components/settings/`). Template assets (`src/assets/`). Outdated README. Unused shadcn UI components (avatar, badge, breadcrumb, card, chart, checkbox, drawer, dropdown-menu, scroll-area, separator, sheet, sidebar, switch, table, tabs, toggle-group, toggle, tooltip). Zombie state fields persist long after their consumers were deleted.

## What "done" looks like

A polished, opinionated desktop app that feels native to the platform. Every UI element has purpose and polish. Every state transition is accounted for. The codebase is modular: features are folders, shared logic is extracted, each file has one responsibility. The user can trust the app with a playlist of 50 videos and walk away — progress survives page refreshes (via the Rust queue persist), errors are recoverable inline, and the download destination is always visible and user-verifiable.

---

## CRITICAL: First instruction before any action

Before you write a single line of code, before you open any file, before you form opinions about what to do: **load the `superpowers` skill**. You can do this by calling the skill tool with `name: "using-superpowers"`. This skill provides standing guidance on workflow discipline, systematic debugging, brainstorming, and execution patterns. You must keep this skill active for the duration of the work — it is not a one-time lookup. Every time you start a new sub-task or encounter ambiguity, re-read the appropriate section of superpowers. The skill tells you how to approach problems; this megaprompt tells you what to fix. Use them together.

After loading superpowers, immediately load the `brainstorming` skill and use it to plan your approach before writing any code. Then load the `frontend-design` skill for UI guidance and the `design-taste-frontend` or applicable design skills. Do not skip these steps.

---

## 1. UI / Visual Design

### Current state findings

The entire design lives in exactly one file: `src/styles.css` (133 lines). It defines CSS custom properties for both `:root` (light) and `.dark` themes, then maps them via `@theme inline` for Tailwind v4 consumption. The type scale is non-existent — everything uses Tailwind's default `text-sm`, `text-base`, `text-xs` classes with no deliberate rhythm.

Typography: `--font-sans: Poppins, sans-serif` — but Poppins is not loaded anywhere in `index.html` or `styles.css`. There's no `@import` or `@font-face` for Poppins. The font fallback renders in whatever the OS provides. Same for `--font-serif: Libre Baskerville` and `--font-mono: IBM Plex Mono` — declared but never loaded. The `index.html` loads `src/styles.css` but no font CDN. The only font that actually exists in the codebase is `@fontsource-variable/geist` in `package.json` (dependency installed but never imported).

Spacing: None of the containers use purposeful spacing. `DownloadPage.tsx` uses `space-y-5 py-4` on every phase's wrapper div — that's it. No section distinction, no visual breathing room between different groups of settings. The header in `App.tsx` uses `h-14` with `px-6` — a default shadcn header pattern.

Color: The light theme background is `oklch(0.98 0.003 70)` — virtually white. The dark theme background is `oklch(0.12 0.003 30)` — near-black. Cards in dark mode use `oklch(0.17 ...)` — a reasonable dark surface. But there's no surface elevation system. Cards, inputs, buttons all share the same flat background. No shadows differentiate depth. The primary color `oklch(0.55 0.22 30)` (YouTube-red) is used for everything — active buttons, focus rings, progress bars, range slider fill. It's the only accent color. Secondary and muted colors are desaturated versions of the same hue (hue 30). There is no complementary or contrasting accent anywhere.

Components: The `button.tsx` is a 58-line CVA definition with 6 variants and 8 sizes — all from the shadcn base-nova template. Nothing custom. The `input.tsx` is a 20-line wrapper. The `select.tsx` is a 201-line template with zero custom styling. The `progress.tsx` is a 25-line Radix wrapper with a gradient on the indicator (the only non-default visual touch in the entire app). Every component looks like every other shadcn/base-nova project.

The range slider (`RangeSelector.tsx`) is hand-rolled with mouse event listeners, raw `div` elements for the track and thumbs. It has no focus styling, no keyboard accessibility, no touch support, no aria attributes. It looks functional but unpolished.

The `DownloadProgress` component in `DownloadProgress.tsx` has a conditional `big` prop that toggles padding (`p-4` vs `p-8`) and some font sizes — two distinct visual states with very little actual difference. The thumbnail area uses `w-20` or `w-32` aspect-video containers.

The playlist entry rows in `PlaylistSelector.tsx` are `px-2 py-1.5` with `hover:bg-accent/50` — minimal hover state. Checkboxes are native HTML `<input type="checkbox">` with `accent-primary` — no styled component.

Zero transitions exist for any state change. Phase transitions in `DownloadPage.tsx` are instant full-page replacements. No mount animations. No loading skeletons for the analyze phase beyond a `Skeleton` component that shows static gray placeholders.

Zero motion or micro-interactions. The `Progress` component has `transition-all duration-500 ease-out` on its indicator — that's the only animation in the entire app.

### Problems

- The app has no visual identity. It looks like a shadcn demo page.
- Fonts are declared but not loaded — the typography system is completely broken.
- No elevation/surface hierarchy. Everything floats on the same plane.
- The red accent is overused. Need a broader palette.
- Range slider is inaccessible, looks hand-made, and doesn't match the rest of the component quality.
- Phase transitions are jarring — content instantly disappears and reappears.
- The theme switcher (`App.tsx` lines 71-84) is three small icon buttons with manual `theme === t.value` ternary styling. It works but looks cramped.
- No responsive consideration whatsoever. The app has a fixed min-width of 800px in Tauri config and uses `max-w-2xl mx-auto` on content. It works for one window size.
- Template SVG assets (`src/assets/tauri.svg`, `typescript.svg`, `vite.svg`) still in the project. No custom app icon in the build pipeline beyond the Tauri icons.

### Concrete target direction

1. **Typography system**
   - Actually import a real font. Load `@fontsource-variable/geist` (already installed) with an `@import` in `styles.css` or via the TS entry point. Remove Poppins/Libre Baskerville/IBM Plex Mono declarations unless you also load them.
   - Define a type scale as CSS custom properties: `--text-xs` through `--text-3xl` with specific sizes, line heights, and letter-spacing. Use these in `@theme` so Tailwind picks them up.
   - Apply the type scale deliberately: `--text-display` for page title (h1), `--text-heading` for section headers, `--text-body` for main content, `--text-caption` for metadata, `--text-label` for form labels.
   - Currently `src/pages/DownloadPage.tsx` has no h1/h2 structure. Add section headings with visible hierarchy.

2. **Color system expansion**
   - Keep the YouTube-red primary (`oklch(0.55 0.22 30)`) but add a secondary accent for non-destructive actions. Consider a cool complement — a desaturated blue or teal — for info/success states instead of using red for everything.
   - Add surface elevation tokens: `--surface-elevated` (cards, 1 level above background), `--surface-overlay` (modals/popovers), `--surface-sunken` (input backgrounds). Map these in `@theme` as `bg-elevated`, `bg-overlay`, `bg-sunken`.
   - Add shadow tokens: `--shadow-card`, `--shadow-dropdown`, `--shadow-modal` with distinct oklch-based values that work in both themes.
   - Redefine `--muted`, `--secondary`, `--accent` so they aren't all the same hue as primary. Give each a purpose.
   - In `.dark`, ensure surface colors have enough contrast. Currently `--muted: oklch(0.20 0.005 30)` against `--background: oklch(0.12 0.003 30)` is only 8% lightness difference — barely visible.

3. **Component-level polish**
   - **Button styling**: The buttons in `DownloadPage.tsx` use `w-full h-11 text-base font-medium` with default shadcn styling. Add proper loading states (not just a manual spinner span), success states (momentary green flash after download), and disable states that look intentional (not just opacity-50).
   - **Progress component**: `src/components/ui/progress.tsx` — increase the indicator animation. Add a pulse/glow at the leading edge. Show a determinate/indeterminate state. The current gradient (`from-primary/80 via-primary to-primary/80`) is a nice touch — extend this concept.
   - **Range slider**: Replace the hand-rolled mouse-event slider in `RangeSelector.tsx` with a proper accessible range input or a slider primitive from base-ui. It currently uses `onMouseDown` on two raw divs with `window.addEventListener('mousemove', ...)` — this is fragile, leaks listeners if unmount happens mid-drag, and has no touch support. Use `@base-ui/react/slider` or a lightweight alternative.
   - **Selects**: The `PlaylistSelector.tsx` uses native `<select>` elements (lines 120-149) while the "ready" phase uses shadcn `<Select>` components. Make them consistent. Both should use the same styled Select.
   - **Checkboxes**: `PlaylistSelector.tsx` lines 51-55 use native `<input type="checkbox">`. Replace with a styled checkbox component (or add one to the ui library).
   - **Status icons**: The `PlaylistSelector.tsx` status icons (lines 59-68) are raw SVG paths. Extract these into a reusable status icon component with consistent sizing and animation.

4. **Surface and layout rework**
   - The `App.tsx` header is basic (`border-b px-6`). Add a subtle backdrop blur, a bottom border that uses `--border` consistently, proper left/right padding that matches the content area.
   - Cards in the "ready" phase (`DownloadPage.tsx`) — each section (VideoInfo, DownloadTypeSelector, QualitySelector, etc.) is a raw div with no card wrapper. They visually float with no container. Group related settings into surfaced cards with subtle borders and consistent padding.
   - The `max-w-2xl mx-auto` constraint gives a 672px content width — fine for a desktop app but the window is 960px wide. Consider widening to `max-w-3xl` or using a two-column layout for the settings grid (quality + encoding on one row, range + preset on another).

5. **Motion and transitions**
   - Phase transitions in `DownloadPage.tsx`: instead of `if (phase === "idle") { return <A> }` / `if (phase === "analyzing") { return <B> }`, animate between phases. Use Framer Motion or CSS transitions with layout animations. At minimum: fade+slide for content swapping, a subtle scale bounce for the progress card appearing.
   - Progress bar: the existing `transition-all duration-500 ease-out` is good. Add a shimmer effect during active downloading.
   - Buttons: press scale (transform: scale(0.97) on active), ripple or glow on hover for primary CTA.
   - List items in playlist: staggered fade-in on mount, height animation when expanding/collapsing.
   - Theme switch: animate the icon rotation or background transition. The current hard cut is jarring.

6. **Empty and loading states**
   - The idle state shows `UrlInput` only — a single input in an otherwise blank page. Add a welcome illustration or icon, a short descriptive text, and recent downloads if any exist.
   - The analyzing state shows a skeleton — good, but the skeleton is a single hardcoded layout in `VideoInfo.tsx` lines 21-29. Make skeletons more varied and match the actual content layout.
   - Error state: `DownloadPage.tsx` lines 112-135 renders an error box with a close button and a "Try Again" button. The error box uses `border-destructive/50 bg-destructive/10` — fine, but there's no actionability beyond retry. If the error mentions a specific problem (yt-dlp not found, network issue), offer contextual help.

### Acceptance criteria for UI/visual design

- The app has a consistent, intentional visual identity that doesn't look like stock shadcn.
- Fonts load correctly. The type scale creates clear hierarchy between titles, section headers, body text, and labels.
- Dark and light themes are both polished, not afterthoughts. Every surface color is readable.
- The range slider is keyboard-accessible, works with touch, and matches the design system.
- Phase transitions are animated (not instant swaps).
- Loading, empty, and error states are all distinct and informative.
- There is at least one micro-interaction or transition per meaningful user action (paste URL → analyze, click download, complete download, etc.).

---

## 2. UX and Interaction Flows

### Current state findings

The app has exactly one page: `src/pages/DownloadPage.tsx`. It uses a `phase` enum (`"idle" | "analyzing" | "ready" | "playlist" | "downloading" | "completed" | "error"`) to gate what's visible. The flow is:

1. **idle**: Shows `UrlInput` only. User types/pastes URL, hits Enter or paste button.
2. **analyzing**: `UrlInput` + `VideoInfo` skeleton. `analyzeUrl()` in `download-store.ts` is called.
3. **ready** (single video): `UrlInput` + `VideoInfo` + `DownloadTypeSelector` + `QualitySelector` + `RangeSelector` + `EncodingSelector` + `PresetSelector` + `DestinationSelector` + Download button + `DownloadProgress`.
4. **playlist**: `UrlInput` + `PlaylistSelector` + `DownloadProgress`. The PlaylistSelector re-renders its own duplicate of DownloadType and Quality selects (native `<select>` elements).
5. **downloading**: Either `UrlInput` + `PlaylistSelector` (playlist) or `UrlInput` + `DownloadProgress big` (single).
6. **completed**: Same as downloading but with a "Download More" reset button.
7. **error**: UrlInput + error box + progress + "Try Again" button.

Problems with this flow:

**Paste behavior**: `UrlInput.tsx` has two paste handlers — `handlePaste` (clipboard button click) and `handleInputPaste` (Ctrl+V on the input). Both call `setUrl` then `setTimeout(() => analyzeUrl(), 50)` — a 50ms timeout hack that exists because `setUrl` is async (Zustand state update) and the subsequent `analyzeUrl()` reads `get().url`. This is a race condition. The 50ms usually works but is not guaranteed. If the analyze fires before the state update propagates, it reads the old (empty) URL and does nothing.

**Phase gating ugliness**: `DownloadPage.tsx` is a series of `if (phase === ...) return (...)` blocks. This means every phase transition fully unmounts and remounts every component. The `UrlInput` is duplicated in every branch. The `DownloadProgress` is conditionally shown in 4 different branches with different `big` prop values. This makes state-driven animations impossible and causes React to lose all DOM state (focus, scroll position, partial input) on phase change.

**Playlist flow duplication**: When the analyze returns a playlist, the app enters the `playlist` phase. The `PlaylistSelector` renders its own DownloadType and Quality selects (native `<select>` with inline options like "Best", "1080p", "720p" — hardcoded fallbacks when `qualityOptions` is empty). But `qualityOptions` is always empty for playlists because `buildQualityOptions` is never called in the playlist branch of `analyzeUrl` (line 226-246). The fallback options are not driven by actual format data. They're guesses.

**No persistent state**: If the user pastes a URL, analyzes it, configures settings, and the app crashes — everything is lost. There's no URL history, no recent downloads list, no session persistence. `analyzeUrl` resets `startTime` and `endTime` to 0 each time (line 220-221), even if the user had previously configured them.

**Download cancellation gap**: `cancelDownload()` in `download-store.ts` (line 515-520) only works for the current `downloadItem`. It calls the Rust `cancel_download` command which kills the child process. For playlist downloads, cancellation should stop the batch, not just the current item. There's no batch cancellation in `startPlaylistDownload()`.

**No download queue visibility**: The Rust backend has a serialized queue (`queue.json` persisted at `app.path().app_data_dir()`), and `get_queue` / `remove_from_queue` commands exist, but the frontend never calls them after initialization. `initProgressListener` sets up Tauri event listeners for real-time progress but the queue itself is invisible to the user. Completed/failed downloads just disappear from the UI on phase change.

**No post-download flow**: After a single download completes, the phase goes to `completed`. The user sees the progress card at 100%, a "Download More" button (which calls `reset()`, wiping all state), and an "Open in Explorer" icon button. There's no "download another from the same URL" or "quick retry with different settings" flow.

**Theme inconsistency**: The theme buttons in `App.tsx` use `rounded-md p-2` with conditional `bg-primary text-primary-foreground` for the active state. The icons are centered. It looks like three radio buttons but behaves like a toggle group. There's no accessible labeling beyond `title={t.label}`.

### Concrete target direction

1. **Eliminate the phase-gate pattern**. Replace the `DownloadPage.tsx` if-else tree with a state-driven layout where sections mount conditionally but the layout structure is stable. Use CSS `display: none` or mount/unmount with animation wrappers, not full re-render trees. At minimum: wrap `UrlInput` outside the phase switch so it's always mounted. Use React `key` or layout animation to transition inner content.

2. **Fix the paste/analyze race condition**. The `setTimeout(analyzeUrl, 50)` in `UrlInput.tsx` must be replaced. Options:
   - Have `setUrl` accept an optional callback, or
   - Make `analyzeUrl` read from the Zustand store's `get()` which is always synchronous — the problem is that `setUrl` hasn't been committed yet when `analyzeUrl` runs in the same synchronous tick. The correct fix: call `setUrl` and then `analyzeUrl` in a `useEffect` that watches `url`, or pass the URL directly to `analyzeUrl(url)` instead of reading from store.
   - The cleaner approach: make `analyzeUrl` accept an optional `url` parameter. When called with a URL, use it directly instead of reading from state.

3. **Make the playlist flow data-driven**. When the analyze response is a playlist, the format data from the first entry (or from a separate non-flat analyze call) should drive the Quality and Encoding options in `PlaylistSelector`. The current hardcoded fallback options ("Best", "1080p", etc.) mislead the user about what quality is actually available. Either:
   - Make a second analyze call for a single entry to get real format data, or
   - Accept that `--flat-playlist` gives minimal data and present the quality options as "presets" (not format-driven), clearly labeled as "Download will use best available quality matching this setting."

4. **Add download history/queue panel**. Create a persistent sidebar or bottom panel showing the download queue (from Rust `queue.json`). Show: all items queued, their current status, progress bars, retry buttons for failed items, and a clear-completed action. This panel should persist across phase changes and be accessible from any state.

5. **Add URL history**. Save the last N URLs (and their analysis results) to localStorage. Show them as a dropdown or recents list below the URL input. Allow re-selecting a previous URL to jump straight to the ready/playlist state without re-analyzing.

6. **Improve error recovery UX**. Instead of resetting everything on error, preserve the user's settings and URL. Show the error inline but keep all form controls visible and editable. Allow the user to change settings and retry without re-pasting the URL.

7. **Add proper loading feedback**. The analyzing phase shows a skeleton (`VideoInfo.tsx`) which is good, but the skeleton appears even when the previous state was "ready" — meaning the user sees a skeleton after already having seen the metadata. Instead: during re-analysis, dim/overlay the existing content rather than replacing it with a skeleton.

8. **Add thoughtful transitions between phases**:
   - Idle → analyzing: fade out welcome text, fade in skeleton.
   - Analyzing → ready: skeleton morphs into actual content (height animation).
   - Ready → downloading: download button transforms into a progress card.
   - Downloading → completed: progress card pulses, checkmark animates in.
   - Any → error: error banner slides in from the top, current content remains visible behind it.

### Acceptance criteria for UX

- No `setTimeout` hacks for state synchronization in the frontend.
- The UrlInput is always visible in every phase (it doesn't remount on phase change).
- Playlist quality options are either data-driven or clearly labeled as approximate presets.
- There is a persistent download queue/history visible somewhere in the UI.
- Users can retry failed downloads without re-pasting the URL.
- Phase transitions are animated, not instant swaps.
- The theme selector is accessible and keyboard-navigable.
- URL history is maintained across sessions.

---

## 3. Functionality Robustness

### Current state findings

**Download retry logic**: `process_download` in `src-tauri/src/commands/download.rs` has a retry loop (lines 167-463) with `max_attempts = 2`. On first failure, it retries without `--embed-thumbnail` and `--add-metadata`. This is a smart workaround for yt-dlp flakiness with embed operations, but the retry is invisible to the frontend — `emit_progress` events may show stale data during the retry gap.

**Premiere mode conversion**: When `premiere_mode` is true and download type is Video, the app runs ffmpeg after yt-dlp to re-encode to H.264/AAC (lines 355-400). The ffmpeg process is spawned with hardcoded args: `-c:v libx264 -pix_fmt yuv420p -c:a aac`. No progress feedback from ffmpeg is sent to the frontend — the conversion status is just set to `Converting` and the progress stays at whatever the last yt-dlp value was until ffmpeg finishes.

**Filename conflict resolution**: `resolve_filename_conflict` in `src-tauri/src/models/mod.rs` (lines 108-121) appends ` [n]` suffix when a file exists. It checks up to 99 iterations. This is solid but only works for the initial filename — if two items in a playlist resolve to the same name (e.g., same title), the sequential resolution works since each item is processed synchronously. However, if the queue ever becomes concurrent, this breaks.

**Playlist download concurrency**: `startPlaylistDownload` in `download-store.ts` (lines 400-512) iterates over selected entries sequentially with `for...of` and `await`. Each item's progress is tracked via a polling pattern (lines 493-505):
```typescript
await new Promise<void>((resolve) => {
  const check = () => {
    const cur = get().playlistItemProgress[idx];
    if (cur.status === "completed" || cur.status === "failed") {
      unsubProgress();
      unsubItem();
      resolve();
    } else {
      setTimeout(check, 200);
    }
  };
  setTimeout(check, 200);
});
```
This polling at 200ms intervals to check if an item is done is fragile. The Tauri event listeners (`listen<DownloadItem>("download-item-update", ...)`) should be sufficient to signal completion, but the code doesn't trust them — it falls back to polling. If the event fires between `listen()` setup and the polling check, or if the event listener closure captures a stale reference, the promise never resolves.

**Thumbnail handling in playlists**: `extract_thumbnail` in `analyze.rs` (lines 118-140) constructs YouTube thumbnail URLs from video IDs (`https://i.ytimg.com/vi/{id}/mqdefault.jpg`). This is a fallback for `--flat-playlist` which doesn't include thumbnails. It works but assumes YouTube. For non-YouTube sources, thumbnails are empty strings and the UI shows a generic video icon.

**Cancellation**: `cancelDownload` in `download.rs` (lines 467-490) kills the child process via `child.kill()`. This works but the cancelled download stays in the queue with status `Cancelled`. No auto-cleanup removes cancelled items. The frontend `cancelDownload()` in the store (line 515-520) sets `phase: "ready"` after cancellation, implying the user can retry — but the Rust-side item still exists in the queue with cancelled status.

**Settings persistence**: `settings.rs` reads/writes `settings.json` to `app.path().app_data_dir()`. The `default_download_folder` defaults to the user's Downloads directory via `dirs::download_dir()`. The `auto_update_ytdlp` and `show_all_formats` settings are saved but have no frontend UI to toggle them (the settings page directory `src/components/settings/` is empty).

**yt-dlp update**: `update.rs` (4 lines, effectively) downloads the latest yt-dlp.exe from GitHub releases and writes it to the binaries directory. No checksum verification, no version comparison, no progress reporting, no fallback if the download fails. If the app is running and yt-dlp is in use during update, the binary gets replaced mid-use.

**No input validation**: The URL input (`UrlInput.tsx`) accepts any string. No validation that it's a valid URL, let alone a YouTube/supported URL. If the user types garbage, yt-dlp fails and the error is displayed. There's no client-side hint or debounce on the input.

**No download size estimation**: The `QualitySelector` shows file sizes when available (`(filesize / 1024 / 1024).toFixed(1) + "MB"`). But for many YouTube formats, `filesize` is `null` (especially for adaptive streams). The selector shows the option without a size estimate — the user has no idea if they're about to download 50MB or 5GB.

### Concrete target direction

1. **Make retry transparent to the frontend**. The Rust backend should not emit "Failed" progress events during retries. The frontend should only see "Failed" when all attempts are exhausted. Either suppress `emit_progress` in the retry path, or add an `attempt` field to the progress payload so the frontend can show "Retrying (attempt 2/2)..."

2. **Show ffmpeg conversion progress**. The `process_download` ffmpeg conversion (lines 367-399) parses ffmpeg's stderr with `parse_ffmpeg_progress` but ignores the result (line 388: `let _ = crate::models::progress::parse_ffmpeg_progress(&text);`). Feed this progress back to the frontend via `emit_progress` with status "Converting" and a calculated percentage.

3. **Replace playback polling with proper promise resolution**. Instead of `setTimeout(check, 200)` polling, use the Tauri event system properly:
   - Create a `oneshot` channel or a promise that resolves when `download-item-update` fires with a Completed/Failed/Cancelled status for the specific item ID.
   - The event listener in `startPlaylistDownload` (lines 475-505) already sets up listeners — it just doesn't properly resolve the promise from them. Use `Promise.withResolvers()` or a manual deferred pattern.

4. **Add input validation and debounce**:
   - Debounce the URL input by ~400ms before auto-analyzing (if the user pauses typing).
   - Validate URL format client-side before sending to Rust.
   - Show a hint if the URL doesn't look like a YouTube URL (e.g., doesn't contain "youtube.com/", "youtu.be/").

5. **Improve cancellation for playlists**: `startPlaylistDownload` should accept an AbortSignal or the store should have a `cancelPlaylistDownload` that sets an abort flag. When cancelled mid-batch, completed items should remain completed, queued items should be marked as cancelled (not failed), and the currently-downloading item should be cleaned up.

6. **Add yt-dlp binary verification**: Before analyzing or downloading, verify the yt-dlp sidecar exists. If not, show a specific error with an "Install/Download yt-dlp" action button. The update command should also verify the written binary is executable.

7. **Add download size estimation for adaptive streams**: When `filesize` is null, estimate from bitrate × duration. yt-dlp JSON includes `tbr` (total bitrate), `vbr`, and `abr` fields. Parse these in `analyze.rs` and compute an estimated size. Display as "~XX MB" in the quality selector.

8. **Fix the binary update to be safe**: Download to a temp file, verify, then rename. Compare versions before downloading. Show download progress in the UI.

### Acceptance criteria for functionality

- Retries are transparent — the UI doesn't flash "Failed" then "Downloading" again.
- ffmpeg conversion progress is visible in the UI.
- Polling-based completion detection is removed. Events drive state transitions.
- URL input is debounced and validated.
- Playlist cancellation stops the batch gracefully (completed items stay completed).
- Download size is estimated and shown for adaptive streams.
- yt-dlp binary presence is verified before use.
- Binary update uses a temp file + rename pattern.

---

## 4. Data Retention / Persistence

### Current state findings

**Settings**: Persisted to `settings.json` in the app data directory. Read on startup via `get_settings` (commands/settings.rs). Written on every setting change. No migration strategy. No validation of saved values.

**Download queue**: Persisted to `queue.json` in the app data directory. `load_saved_queue` runs during `setup` (`lib.rs` line 23). The queue is written on every status change via `save_queue()` calls scattered throughout `download.rs`. The queue stores full `DownloadItem` objects including progress, status, speed, eta — transient data that's stale on next launch.

**Presets**: Stored in `localStorage` under key `ytmate-presets` (download-store.ts lines 11-25). Survives page refreshes but not app data directory wipes. No sync with Rust backend — if the Tauri webview storage is cleared, presets are lost silently.

**Theme preference**: Stored in `localStorage` under key `ytmate-theme` (App.tsx lines 25-26, 48). Same fragility as presets.

**No download history**: Completed/cancelled/failed items in the Rust queue persist indefinitely. No retention policy. The `get_queue` command exists but the frontend never calls it (only used internally for event emission). The queue is append-only — items are never removed unless `remove_from_queue` is explicitly called, which the frontend doesn't.

**No download path tracking**: The `DownloadItem` stores `output_path` (the directory) and `filename` (the resolved output file name), but there's no user-facing "where did my download go" UI beyond the "Open in Explorer" icon button in `DownloadProgress.tsx`. If the user closes the app and reopens, previously downloaded files are not shown anywhere.

**No analysis caching**: Every time the user pastes a URL, a new yt-dlp subprocess is spawned. If they paste the same URL twice, it's analyzed twice. No in-memory or on-disk cache of analysis results.

### Problems

- localStorage and Rust-side persistence are disjoint — no single source of truth.
- The queue stores ephemeral runtime data (progress, speed) that's stale on restart.
- No download history — items vanish from the UI on reset.
- No analysis caching — redundant yt-dlp calls waste time and rate-limit capacity.
- No retention policy — the queue file grows unboundedly.
- No validation or migration for persisted settings or queue data.

### Concrete target direction

1. **Single source of truth for app state**. Move all user-facing persisted state (settings, presets, theme, recent URLs, download history) to the Rust backend. The frontend reads on startup and writes through Tauri commands. Use a single `app.json` or a SQLite database (via `tauri-plugin-sql` or rusqlite) for structured querying.

2. **Split the queue into two tiers**:
   - **Active queue**: Items currently downloading or queued to download. Ephemeral, rebuilt from events. Not persisted (or persisted only as recovery).
   - **Download history**: Items that completed, failed, or were cancelled. Persisted indefinitely with metadata (URL, title, filename, output path, timestamp, file size, status). The frontend shows this as a history list with retry/edit/delete actions.

3. **Add analysis cache**. Cache the `AnalyzeResponse` keyed by URL. In-memory cache with TTL (10 minutes). On cache hit, skip the yt-dlp call. Invalidate on error. For playlists, cache the entry list but re-fetch if the user explicitly requests refresh.

4. **Add download timestamp and output file verification**. Each completed download should record:
   - ISO 8601 timestamp of completion
   - Full output path
   - File size (check on disk, don't rely on yt-dlp's reported size)
   - Source URL
   - Whether the file still exists on disk (for history display)

5. **Add data migration strategy**. If the persisted data format changes (e.g., new settings fields), handle migration gracefully. Store a schema version number. On version mismatch, migrate or rebuild.

6. **Remove stale queue data on startup**. On app launch, iterate the persisted queue:
   - Mark any items in "Downloading" or "Queued" status as "Failed" (the process no longer exists).
   - Keep "Completed" items as history.
   - Optionally discard items older than 30 days.

### Acceptance criteria for persistence

- Settings, presets, and theme preference survive app restart and directory moves.
- Download history is visible in the UI and survives page refreshes.
- Analysis results are cached (at least in-memory) to avoid redundant yt-dlp calls.
- The queue file doesn't grow unbounded — old completed/failed items are pruned.
- A schema version is stored alongside data for migration support.
- On restart, downloads that were in-flight are marked as failed with a clear reason.

---

## 5. Streaming

### Current state findings

The app uses Tauri events for real-time progress streaming:

1. `download-progress` event: Emitted from `emit_progress` in `download.rs` (line 48-56) — includes `id`, `progress` (f64), `speed` (string), `eta` (string), `status` (string). Emitted every time yt-dlp outputs a progress line.

2. `download-item-update` event: Emitted from `emit_item_update` (line 58-63) — fires the full `DownloadItem` serialized. Emitted on queue mutations and periodic progress updates.

The frontend subscribes in `initProgressListener` (`download-store.ts` lines 522-551) with two `listen()` calls. For single downloads, this works fine.

For playlist downloads, `startPlaylistDownload` also creates per-item listeners (lines 475-489). This creates a problem: both the global listener (from `initProgressListener`) and the per-item listener fire for the same events. The global listener sets `downloadProgress`, `downloadSpeed`, etc. on the store, while the per-item listener updates `playlistItemProgress[idx]`. The global listener's values are stale/irrelevant during playlist downloads because they reflect the last item only, but the UI still shows the big `DownloadProgress` card in some states.

**The streaming loop**: `process_download` reads stdout/stderr from the yt-dlp child process via `rx.recv().await` (line 298). This is a simple loop — read line, parse progress, emit event, repeat. There's no:
- Backpressure handling (if the frontend is slow to process events, the backend keeps emitting).
- Batching (every progress line fires an event, potentially hundreds per second for fast downloads).
- Reconnection (if the Tauri IPC connection drops, events are lost and the UI never updates).
- Debouncing (rapid progress updates cause unnecessary React re-renders on every event).

**The ffmpeg gap**: During Premiere mode conversion, the ffmpeg child process output is parsed but its progress is thrown away (line 388). The frontend sees "Converting" status with a frozen progress bar until ffmpeg finishes.

**Frontend rendering**: The `DownloadProgress` component destructures store values and re-renders on every event. For a 10MB/s download with multiple progress events per second, this causes excessive React re-renders. The `Progress` component has `transition-all duration-500 ease-out` which smooths the visual update, but React still diffes and patches the DOM on every event.

### Concrete target direction

1. **Throttle event emission on the Rust side**. Don't emit every progress line. Emit at most every 100ms or when the progress delta exceeds 1%. This reduces IPC pressure and frontend re-renders. The `emit_progress` function should:
   ```rust
   // Pseudocode for throttling
   let now = std::time::Instant::now();
   let last_emit = emit_cache.entry(id.clone()).or_insert(now);
   if now.duration_since(*last_emit) < Duration::from_millis(100) && info.percent - last_percent < 1.0 {
       // Update queue but don't emit
   } else {
       *last_emit = now;
       emit_progress(...);
   }
   ```

2. **Batch events on the frontend**. Use `requestAnimationFrame` or a micro-queue to batch progress updates before calling setState. The Zustand store should batch updates via `set()` with the `replace` option or by pre-aggregating:
   ```typescript
   // In initProgressListener, debounce progress updates
   let pendingUpdate: ProgressPayload | null = null;
   const flush = () => {
     if (pendingUpdate) set({ ... });
     pendingUpdate = null;
     rafId = null;
   };
   // On event: store latest, schedule flush via rAF
   ```

3. **Send ffmpeg conversion progress to the frontend**. In `process_download` line 388, instead of `let _ = parse_ffmpeg_progress(&text)`, compute a progress percentage:
   ```rust
   if let Some(ffmpeg_time) = parse_ffmpeg_progress(&text) {
       // Need total duration from the video metadata
       if total_duration > 0.0 {
           let pct = (ffmpeg_time / total_duration) * 100.0;
           emit_progress(&app, &id, pct, "", "", "Converting");
       }
   }
   ```
   This requires passing the video duration into `process_download` (it's available in the `DownloadRequest` as part of the encoding context, but not currently passed).

4. **Separate global and per-item event handling**. During playlist downloads, the global `initProgressListener` should either:
   - Not update global progress fields (defer to per-item state), or
   - Update a "current item" substate that the UI uses for the currently-active download.
   Currently both fire and conflict. The fix: add a `isPlaylistBatch` flag to the store. When `true`, the global listener only updates internal queue state, not the display-oriented progress fields.

5. **Add reconnection handling for events**. If the Tauri event system drops events or the listener is re-registered (e.g., after StrictMode double-mount), the app should handle gracefully. The current code uses `initProgressListener` in an effect with cleanup (`return () => cleanup()`). Ensure the cleanup actually removes listeners (the current code calls `unlisten1.then(fn => fn())` which is correct but the `.then()` means errors are silently swallowed).

### Acceptance criteria for streaming

- Progress events are throttled to at most 10 per second on the Rust side.
- Frontend batches progress updates via requestAnimationFrame.
- ffmpeg conversion progress is sent to and displayed by the frontend.
- Global and per-item progress events don't conflict during playlist downloads.
- Event listener cleanup is robust (no double-registration, no memory leaks).

---

## 6. Performance / Fast Processing

### Current state findings

**Bottleneck: yt-dlp single-thread analysis**. The `analyze_video` command calls `yt-dlp -J --no-download --flat-playlist` which is a single-process, single-thread call. For large playlists (100+ videos), the JSON output can be hundreds of kilobytes. The Rust code parses the full JSON with `serde_json::from_str` — this blocks the async runtime for large payloads.

**Bottleneck: Sequential playlist downloads**. `startPlaylistDownload` processes items one by one with `for...of` + `await`. Total time = sum of all download times. No parallel downloads, no connection reuse. yt-dlp reportedly handles concurrent downloads with some caveats; the app could spawn 2-3 concurrent yt-dlp processes for playlist items.

**Bottleneck: React re-renders**. The Zustand store is a flat object with ~50 fields. Any `set()` call (and they fire on every progress event) triggers a re-render in every component that uses `useDownloadStore()`, even if the changed field is irrelevant to that component. For example, `DownloadProgress` subscribes to most fields via a single `const { downloadItem, downloadProgress, downloadSpeed, ... } = useDownloadStore()` — any state change re-renders it.

**Bottleneck: No virtualization for playlist**. The `PlaylistSelector` renders all playlist entries in a flat list with `overflow-y-auto max-h-80`. For a 500-video playlist, this creates 500 DOM nodes. Since React reconciles all of them on every progress update, this becomes a performance issue. No windowing/virtualization.

**Bottleneck: Rust lock contention**. The `SharedQueue` is `Arc<Mutex<DownloadQueue>>`. Every progress update acquires the lock to `q.update()`, then releases. In the streaming loop, progress events fire this lock + event emit in quick succession. For concurrent downloads (if added), the lock becomes a contention point.

**Minor: CSS-in-JS no runtime**. Tailwind with Vite generates static CSS. No runtime overhead. This is fine.

**Minor: No code splitting**. The entire frontend is one bundle (`vite build` produces a single JS file). For a Tauri app where JS is loaded from disk, this doesn't matter much for initial load time, but it means unused components (like the 18 dead shadcn UI files) are still parsed and part of the module graph.

### Concrete target direction

1. **Optimize yt-dlp analysis for large playlists**. The current single `--flat-playlist` call is appropriate. The JSON parsing can be optimized by streaming the JSON with `serde_json::StreamDeserializer` or by reading only the fields needed (entries array, title) rather than parsing all fields. However, for playlists of typical size (< 200 entries), the current approach is fine. Focus optimization effort elsewhere.

2. **Add parallel playlist downloads with a concurrency limit**. Accept a concurrency setting (default: 2 parallel downloads). Use a `tokio::semaphore` to limit concurrency. The download logic per item is already async — wrap it with `tokio::spawn` and acquire a semaphore permit before each. The sequential `for` loop becomes a `futures::stream::FuturesUnordered` or a manual `JoinSet`.

3. **Slice Zustand subscriptions**. Components should select only the fields they need, not the entire store. Currently:
   ```typescript
   // Bad — re-renders on every state change
   const { downloadItem, downloadProgress, downloadSpeed, ... } = useDownloadStore();
   // Good — re-renders only when these fields change
   const downloadItem = useDownloadStore((s) => s.downloadItem);
   const progress = useDownloadStore((s) => s.downloadProgress);
   ```
   Refactor every component that uses `useDownloadStore()` with selective subscriptions. This is the single highest-impact frontend performance fix.

4. **Virtualize the playlist list**. For playlists with > 50 entries, use a virtualized list (via `@tanstack/react-virtual` or a lightweight virtualizer). Only render visible entries + a buffer. The current native scroll with `overflow-y-auto` renders all entries.

5. **Reduce lock contention**. For the Rust queue, consider using `tokio::sync::RwLock` instead of `std::sync::Mutex` in async context. Or switch to a lock-free concurrent queue (e.g., `crossbeam::queue`). The current `Mutex` is held during event emission — move the emit outside the lock.

6. **Tree-shake unused ui components**. The `src/components/ui/` directory has 25 files. Only 7 are actually imported by download components: `button.tsx`, `input.tsx`, `label.tsx`, `progress.tsx`, `select.tsx`, `skeleton.tsx`, `sonner.tsx`. The other 18 (`avatar.tsx`, `badge.tsx`, `breadcrumb.tsx`, `card.tsx`, `chart.tsx`, `checkbox.tsx`, `drawer.tsx`, `dropdown-menu.tsx`, `scroll-area.tsx`, `separator.tsx`, `sheet.tsx`, `sidebar.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`, `toggle-group.tsx`, `toggle.tsx`, `tooltip.tsx`) are dead code. Remove them.

7. **Remove dead template assets**. `src/assets/tauri.svg`, `typescript.svg`, `vite.svg` are template leftovers. Delete them.

### Acceptance criteria for performance

- Playlist download supports 2-3 concurrent items (configurable).
- Frontend components use selective Zustand subscriptions.
- Playlist with > 50 entries uses virtualized rendering.
- Rust queue lock is not held during IPC event emission.
- All unused shadcn UI components and template assets are removed.
- No React re-render storms during active downloads (verify with React DevTools profiler).

---

## 7. Configurability / More Options

### Current state findings

**Settings (`AppSettings` in Rust, `useSettingsStore` in frontend)**: Four fields:
- `default_download_folder` — string path
- `auto_update_ytdlp` — boolean, not wired to any UI
- `auto_convert_premiere` — boolean, not wired to any UI
- `show_all_formats` — boolean, not wired to any UI

Three of four settings have no frontend controls. There is no Settings page or panel. The `src/components/settings/` directory is empty. The `settings-store.ts` loads and saves settings, but the only one the user can change is `default_download_folder` (via `DestinationSelector.tsx` using `browseFolder`).

**Presets**: Store-able in localStorage. The `PresetSelector` lets users save/load/delete presets. Presets include `downloadType`, `encoding`, `premiereMode`. But they can't be renamed, reordered, or exported. The default preset ("Premiere Pro") is added on first launch if no presets exist.

**Quality**: `QualitySelector` shows all available formats grouped by height. No "show all formats" toggle (the `show_all_formats` setting exists but isn't wired). No way to filter by codec (H.264 vs AV1 vs VP9). No way to set a max file size. No way to prefer a specific codec.

**Download options**: No option to:
- Set the output filename pattern (currently `{title}.{ext}` only).
- Append date/channel to filename.
- Create sub-folders per channel/playlist.
- Set the concurrency level for playlist downloads.
- Limit download speed (yt-dlp supports `--limit-rate`).
- Skip existing files or always overwrite.
- Download subtitles/chapters/comments.
- Write description/metadata to separate file.
- Set a proxy server.

**No per-playlist configuration override**. When downloading a playlist, the user picks quality/encoding once — it applies to every item. Some items might benefit from different settings (e.g., format availability varies per video).

### Concrete target direction

1. **Build a Settings page/panel**. Create `src/features/settings/SettingsPage.tsx` with controls for:
   - Default download folder (browse button + path display)
   - Auto-update yt-dlp on launch (toggle)
   - Auto-convert to Premiere-compatible (toggle)
   - Show all formats (toggle) — when off, group formats by height and show only best per group (current behavior). When on, show every individual format.
   - Concurrency limit for playlist downloads (number input, 1-5)
   - Default encoding per type (video: mp4/mkv/webm, audio: mp3/m4a/flac/opus/wav)
   - Theme override (light/dark/system — currently only available via header buttons)

2. **Add output filename pattern configuration**. Allow user to set a pattern like `{title}` (default), `{title} - {channel}`, `{date} - {title}`, `{id}`. Support common yt-dlp output template fields. Store the pattern in settings.

3. **Add format filtering options**. Expand the quality selector to:
   - Show/Hide codec labels (H.264, AV1, VP9, etc.)
   - Filter by container (MP4, WebM, MKV)
   - Sort by size, quality, or codec
   - An "Auto" mode that picks the best quality under a configurable max file size

4. **Add download speed limit**. Add an optional field in both single and playlist download flows: "Limit speed (KB/s)". Pass `--limit-rate` to yt-dlp when set.

5. **Add subtitle download toggle**. Add a checkbox: "Download subtitles" (passes `--write-subs --sub-lang en`). Store in preset.

6. **Add output directory structure options**. For playlists:
   - Flat: all in one folder (current behavior)
   - Per-channel: `/channel_name/title.ext`
   - Per-playlist: `/playlist_name/title.ext` (already done in `startPlaylistDownload` by appending playlist folder name)
   Make this configurable with a radio or select.

### Acceptance criteria for configurability

- Settings page/panel is accessible from the header or a gear icon.
- All four existing AppSettings fields have UI controls.
- Filename pattern is configurable.
- Quality selector supports filtering/sorting options.
- Download speed limit is settable.
- Subtitle download option exists.
- Output directory structure for playlists is configurable (flat / per-playlist / per-channel).

---

## 8. Design Patterns

### Current anti-patterns found in the codebase

**1. God component: `DownloadPage.tsx`** (138 lines). Handles all phases via if-else branching. The component itself has no business logic but orchestrates 8 child components + 3 phases of the same components. Every phase renders the same `UrlInput`, making it impossible to animate transitions. The phase logic is sequential `if` statements — fragile to maintain as phases grow.

**2. God store: `download-store.ts`** (580 lines). This single Zustand store manages:
- URL input state and analysis
- Metadata, formats, quality options
- Playlist entry selection
- All download options (type, quality, time range, encoding, filename, output dir)
- Preset CRUD
- Download progress tracking (both single and playlist)
- Tauri event listener lifecycle
- Phase state machine

These are at least 4 separate concerns (analysis, options, download execution, presets). They should be split into separate stores or a cleanly separated slice structure.

**3. Prop drilling avoidance by store tunneling**. Components reach directly into stores with `useDownloadStore()` and `useSettingsStore()`. This makes components impossible to test in isolation and creates invisible coupling. For example, `DestinationSelector.tsx` imports both `useDownloadStore` and `useSettingsStore` — it reads 4 fields and calls 1 action. The component's behavior is entirely determined by which store fields it selects.

**4. Logic in components**. `DownloadProgress.tsx` has inline logic for determining status colors, labels, icon visibility, and layout based on `big` prop. `PlaylistSelector.tsx` has inline logic for playlist status display, progress bar rendering, and selection management. These concerns should be extracted into hooks or helper components.

**5. Uncontrolled side effects in stores**. `startPlaylistDownload` is an action on the store but it:
- Iterates over entries
- Sets up event listeners per item
- Creates promises with polling
- Mutates store state from inside async callbacks
- Has side-effect dependencies on external Tauri events
This is procedural spaghetti in what should be a state container. The download orchestration should live in a custom hook or a service module, not in the store.

**6. Duplicate rendering of options**. The PlaylistSelector duplicates DownloadType and Quality selects (native `<select>`) that already exist as shadcn `<Select>` components in the "ready" phase view. This is both a visual inconsistency and a maintenance burden — adding a new option type requires editing two components.

**7. Magic strings and inline data**. Encoding options are defined in two places:
- `download-store.ts` lines 282-285 (inline arrays per download type)
- `EncodingSelector.tsx` lines 11-24 (same arrays redefined)
- `process_download` in `download.rs` lines 82-90 and 186-218 (encoding → ext and encoding → audio-format mappings)
If a new encoding is added, it must be updated in 3+ locations. No single source of truth.

**8. Error handling inconsistencies**. Some errors are caught and displayed as user-facing messages. Others are swallowed with empty catch blocks (`catch {}` in `UrlInput.tsx` line 17, `catch {}` in `download-store.ts` line 23). Some are `eprintln!` (developer-only, visible in terminal). No consistent error hierarchy or propagation strategy.

**9. No repository/data access layer**. The Tauri commands (`invoke`) are called directly from components and stores. There's no abstraction layer between UI and IPC. Testing any component requires a running Tauri runtime. The `tauri.ts` file is a thin wrapper (one function per command) — it's not an abstraction, it's just formatting.

**10. Inconsistent async patterns**. Some async functions use `.then()` (e.g., `initProgressListener` lines 548-549), some use `await` (most actions), some use promise-construction with polling (`startPlaylistDownload` lines 493-505). Mixing patterns makes the code harder to reason about.

### Concrete target direction

1. **Split the god store into domain slices**. Create separate Zustand stores or use Zustand slices:
   - `useAnalysisStore` — URL input, analysis state, metadata, formats, quality options
   - `useDownloadOptionsStore` — download type, quality, encoding, time range, filename, output dir
   - `useDownloadStore` — phase, progress, download item, cancellation
   - `usePlaylistStore` — playlist entries, selection, per-item progress
   - `usePresetStore` — presets CRUD
   - `useSettingsStore` — already exists, keep as-is

   If using Zustand slices, keep a single `create()` call but split the logic into slice factories:
   ```typescript
   const useBoundStore = create<Store>()((...a) => ({
     ...createAnalysisSlice(...a),
     ...createOptionsSlice(...a),
     ...createDownloadSlice(...a),
     ...createPlaylistSlice(...a),
     ...createPresetSlice(...a),
   }))
   ```

2. **Extract download orchestration into a service/hook**. The procedural loop in `startPlaylistDownload` should become a `usePlaylistDownload()` hook that:
   - Uses `usePlaylistStore` for state
   - Calls a `DownloadService` (class or module) that wraps Tauri commands
   - Returns progress state and control methods (start, cancel, pause)
   - The store only holds state; the hook orchestrates side effects

3. **Create a single source of truth for encoding/format mappings**. Define encoding configurations in a shared module (`src/lib/encoding-config.ts`):
   ```typescript
   export const encodingConfig = {
     video: [
       { key: "mp4_h264", label: "MP4 (H.264)", ext: "mp4", mergeFormat: "mp4" },
       { key: "mp4_h265", label: "MP4 (H.265/HEVC)", ext: "mp4", mergeFormat: "mp4" },
       { key: "mkv", label: "MKV", ext: "mkv", mergeFormat: "mkv" },
       { key: "webm", label: "WebM", ext: "webm", mergeFormat: "webm" },
     ],
     audio: [
       { key: "mp3", label: "MP3", ext: "mp3", audioFormat: "mp3", embedThumbnail: true },
       // ...
     ],
   } as const
   ```
   Both frontend (EncodingSelector, DownloadTypeSelector switching) and Rust (process_download arg construction) should derive from this. Either share the config or keep Rust and TS versions in sync — but document the cross-reference.

4. **Extract inline component logic**:
   - `DownloadProgress.tsx` — extract status color map, label map, and icon selection into a `downloadStatusConfig` constant.
   - `PlaylistSelector.tsx` — extract status icon rendering into `<PlaylistItemStatusIcon status={status} />`.
   - `RangeSelector.tsx` — extract the drag-handle logic into a `useSliderDrag` hook.

5. **Replace polling with proper async primitives**. The `startPlaylistDownload` poll loop should become:
   ```typescript
   // Create a deferred per item
   const deferred = createDeferred<void>();
   const unsub = await listen("download-item-update", (e) => {
     if (e.payload.id === item.id && isTerminal(e.payload.status)) {
       deferred.resolve();
     }
   });
   await deferred.promise;
   unsub();
   ```
   Where `createDeferred()` is a simple Promise.withResolvers() wrapper.

6. **Create a data access layer**. Wrap all Tauri invoke calls in a `DataService` class:
   ```typescript
   class DataService {
     async analyzeVideo(url: string): Promise<AnalyzeResponse> { ... }
     async enqueueDownload(req: DownloadRequest): Promise<DownloadItem> { ... }
     // ...
   }
   export const dataService = new DataService();
   ```
   Components import `dataService` instead of directly calling `invoke`. This makes the API mockable for testing.

### Acceptance criteria for design patterns

- The 580-line store is split into 3-6 domain slices or separate stores.
- Download orchestration (especially playlist) is in a hook or service, not in the store.
- Encoding configuration has a single source of truth.
- No polling loops exist — all async completion uses promises/events.
- A DataService layer wraps all Tauri IPC calls.
- Unused/shared constants (status maps, encoding options) are extracted from components.

---

## 9. Edge Case Handling

### Current state findings — enumerate real edge cases

**EC1: Empty URL submission.** `analyzeUrl` checks `if (!url.trim()) return` (line 211). Silent no-op. No user feedback. The user clicks paste or hits enter with an empty field — nothing happens.

**EC2: Invalid non-YouTube URL.** Any URL is passed to yt-dlp. If yt-dlp can't handle it, the error is caught and displayed in the error state. But the error message is raw yt-dlp stderr — confusing to users ("ERROR: Unsupported URL: https://example.com").

**EC3: Very large playlists (500+ videos).** The playlist selector renders all entries in a non-virtualized list. `max-h-80` clips the viewport but all DOM nodes exist. Loading state: the analysis takes a while (single yt-dlp call returns but parsing is synchronous). No intermediate progress during analysis.

**EC4: Network disconnection during download.** yt-dlp handles retries internally (default 10 retries). The app's additional retry layer (max 2 attempts) may kick in. The streaming loop continues to receive stdout from yt-dlp while it retries. If the network is permanently down, yt-dlp eventually exits with non-zero code, and the app marks the download as failed. No user-visible "network disconnected" message.

**EC5: App closed during active download.** When the Tauri window closes, any spawned child processes continue running (orphaned). On restart, `load_saved_queue` loads items that were in "Downloading" status from the previous session. They remain stuck in "Downloading" forever. The frontend never recovers them.

**EC6: Disk full / permission error.** yt-dlp will fail to write the output file. The error appears in stderr. The Rust code captures it in `error_lines` (line 293) and includes it in the final error message. But the error is shown as a raw yt-dlp error message string, not a user-friendly explanation.

**EC7: Filename collision with existing directory.** `resolve_filename_conflict` only checks for file existence. If a directory exists with the same name as the intended output file, the file creation fails with a permission error from yt-dlp.

**EC8: URL with special characters.** The URL is passed directly from the frontend to the Rust backend as a string. yt-dlp's sidecar is spawned with `args([...&url])`. URL-encoded characters are passed through. This should work, but if the user pastes a URL with newlines or trailing/leading whitespace, `url.trim()` handles it. Unicode URLs (e.g., with Chinese characters) may have issues depending on the shell/OS. Tauri's sidecar API handles this better than raw `Command::new`, but it's untested.

**EC9: Zero-duration video (livestream).** `duration: 0` from yt-dlp for live streams. The UI shows "0:00" via `formatDuration(0)`. The RangeSelector computes `maxTime = 0` and the track click handler divides by zero (guarded by `if (maxTime <= 0)` in `handleTrackClick` line 18 — the guard exists). The format compute `pct(0) = 0` at line 12-14: `pct = (0 / 0) * 100` → `NaN`. Actually `maxTime > 0` is false so `(v / 0)` yields Infinity. The progress bar becomes NaN%. This is a real bug in `pct()`.

**EC10: Concurrent paste/analyze.** User pastes URL A, then immediately pastes URL B before analysis of A completes. The `analyzeUrl` action calls `set({ phase: "analyzing", ... })` which resets everything. The in-flight `invoke("analyze_video", { url: A })` continues on the Rust side but its result is discarded when it resolves (the store has already moved on). No abort mechanism tells Rust to cancel the in-flight analysis.

**EC11: Zero selected playlist items.** The "Download Selected" button is disabled when `count === 0` (PlaylistSelector.tsx line 155). Good. But if the user navigates to the playlist phase, deselects all items, the button is disabled with no explanation message.

**EC12: Output directory doesn't exist.** If the user picks a directory that is then deleted before download completes, yt-dlp fails with a file-not-found error. The app's retry logic doesn't help. The error message is raw.

**EC13: yt-dlp not installed / wrong version.** The sidecar may not exist (binary wasn't bundled). `process_download` checks this (line 274: `app.shell().sidecar("yt-dlp")` returns `Err`). The error message "Sidecar not found:" is developer-oriented. The frontend shows it to the user.

**EC14: ffmpeg not installed (for Premiere mode).** Same sidecar check, same opaque error.

**EC15: Multiple rapid download starts.** If the user clicks "Download" twice quickly (`startDownload`), two `enqueueDownload` calls are made. The first creates an item and spawns `process_download`; the second creates another. The queue has two items. The progress UI only shows one `downloadItem`. The second download runs invisibly.

### Concrete target direction

1. **EC1 (Empty URL):** Show an inline tooltip or error: "Enter a URL to analyze". The input should have a visual validation state.

2. **EC2 (Invalid URL):** After yt-dlp returns an error, check if the error message contains "Unsupported URL" and show "This URL isn't supported. Try a YouTube or supported video platform URL." For other errors, show a truncated, cleaned version of the error without raw stderr escapes.

3. **EC3 (Large playlists):** Virtualize the entry list. Show "Analyzing playlist... (N videos found)" as intermediate state. Use `requestIdleCallback` or a microtask loop to parse and render entries progressively.

4. **EC4 (Network disconnection):** Subscribe to `navigator.onLine` events in the frontend. When offline, show a banner "Network disconnected — download paused". yt-dlp will retry internally; the app's retry should wait longer between attempts when offline.

5. **EC5 (App closed during download):** On startup, in `load_saved_queue`, mark all non-terminal items (Queued, Downloading, Merging, Converting) as `Failed("App was closed")`. This prevents zombie "Downloading" items in the queue. Also consider an auto-resume feature: store the download state and offer to resume on next launch (complex — flag as aspirational).

6. **EC6 (Disk/permission errors):** Parse yt-dlp stderr for common patterns ("No space left on device", "Permission denied"). Map to user-friendly messages. Show disk space info (available bytes on the target drive) when a disk-full error occurs.

7. **EC7 (Filename collision with directory):** `resolve_filename_conflict` should check if a directory exists with the target name before a file. If so, use a different suffix early, before yt-dlp fails.

8. **EC9 (Zero duration / live streams):** Fix `pct()` to handle `maxTime === 0`: `const pct = (v: number) => (maxTime > 0 ? (v / maxTime) * 100 : 0)`. The condition already exists but `endTime` defaults to `meta.duration` (0 for live streams), making both start and end at 0. Add a guard: if duration is 0 or missing, hide the RangeSelector entirely and show a "Live stream — full duration will be downloaded" message.

9. **EC10 (Concurrent analyze):** Use an AbortController pattern. When `analyzeUrl` is called while a previous analysis is in flight, abort the previous one. Pass the AbortSignal to the Tauri invoke call (if supported) or simply ignore the result of the first call by using a generation counter:
   ```typescript
   let analyzeGen = 0;
   const analyzeUrl = async (url: string) => {
     const gen = ++analyzeGen;
     const res = await analyzeVideo(url);
     if (gen !== analyzeGen) return; // stale result
     set({ ... });
   };
   ```

10. **EC12 (Output directory deleted):** Before starting a download (in `process_download`), verify the output directory exists. If not, emit a progress event with a specific error and return immediately instead of failing midway.

11. **EC13/EC14 (Missing binaries):** Check both sidecars on app startup. Show a persistent warning banner if either is missing. Provide a "Download yt-dlp" action in the UI. The `update_ytdlp` command can serve as a first-time install as well — rename the UI action "Install/Update yt-dlp".

12. **EC15 (Rapid clicks):** The Download button should be disabled immediately on click (it already is, via `disabled={!canDownload}` where `canDownload = !isDownloading`). But if `isDownloading` is set after the first `startDownload` call completes its first `set(...)` line, there's a window. Ensure `set({ isDownloading: true })` is the very first synchronous operation in `startDownload`, before the `await`. Currently it is (line 376), so this is already guarded — but only if the store update is synchronous (Zustand's `set` is synchronous). Add a second guard: use a ref or boolean to prevent re-entry.

### Acceptance criteria for edge cases

- Empty URL shows inline validation, not silent no-op.
- Large playlists (> 200 entries) use virtualized rendering.
- App-closed-during-download leaves no zombie "Downloading" items in the queue.
- Zero-duration/live streams don't cause NaN in progress or range slider.
- Concurrent analyze requests are properly canceled (generation counter or AbortController).
- Missing binaries show a clear user-facing error with an action button.
- Rapid double-clicks are guarded at multiple levels.

---

## 10. File Handling

### Current state findings

**Download flow**: `enqueue_download` (Rust) receives a `DownloadRequest` with `url`, `format_id`, `filename`, `output_dir`, etc. The filename is sanitized for invalid Windows characters via `sanitize_filename()` (replace `\ / : * ? " < > |` with `_`). Conflict resolution appends ` [N]` before extension.

**Output format**: Files are saved as `{output_dir}/{filename}.{ext}`. The ext is determined by encoding:
- mp4_h264/mp4_h265 → `mp4`
- mkv → `mkv`
- webm → `webm`
- audio encodings → their respective extensions

**Playlist output**: `startPlaylistDownload` (frontend) appends the playlist title as a subfolder: `{baseDir}/{playlist_title}/{filename}.{ext}`. The playlist title is sanitized the same way.

**No file type validation**: The app doesn't validate that the downloaded file is a valid media file. yt-dlp could theoretically output a different format than requested (though unlikely). No post-download integrity check.

**No file size check before download**: For large files (4K video), the user has no warning about disk space. The quality selector shows file size when available, but many formats report `filesize: null`.

**Open in Explorer**: `open_in_explorer` in `download.rs` (lines 514-519) runs `explorer {path}`. This opens the Windows Explorer with the folder selected. If the path doesn't exist, Explorer opens to "This PC" or an error dialog.

**No file cleanup on cancel**: When a download is cancelled, yt-dlp's partial output file (`.part` or `.ytdl` extension) is left on disk. yt-dlp's `--no-part` flag (line 226) disables the `.part` suffix — partial downloads write directly to the target file. A cancelled download leaves a corrupt/incomplete file.

**No batch download destination feedback**: During playlist downloads, the destination is shown in the per-item progress but the playlist folder path is not displayed anywhere. The user doesn't know where the files are going until they click "Open in Explorer" on individual items.

**No file name preview for playlists**: The `DestinationSelector` shows `{dir}\{filename}.{ext}` for single videos. For playlists, there's no equivalent — the user can't see the folder structure or naming pattern before starting.

### Concrete target direction

1. **Show destination preview for playlists**. In the `PlaylistSelector`, add a "Save to" row with the computed playlist folder path: `{baseDir}\{playlist_title}\`. Show a "Browse" button to override the base directory (leave the playlist subfolder as default).

2. **Clean up partial files on cancellation/failure**. In `cancel_download` (Rust), after killing the child process, check for and remove any file matching the download item's output path. In `process_download` on failure, attempt cleanup of the partial output.

3. **Add post-download file verification**. After yt-dlp signals completion, verify the output file exists and has non-zero size. If missing or zero-size, mark the download as failed with "Output file not found after download".

4. **Check disk space before download**. In `process_download`, before spawning yt-dlp, check available disk space on the output drive. If estimated file size (from format info) exceeds available space, emit an error immediately. Use `fs2` or similar crate for disk space querying.

5. **Add configurable overwrite behavior**. Add a setting (default: "smart rename" = current behavior with `[N]` suffix). Options: "always overwrite" (pass `--overwrites`), "skip if exists" (pass `--no-overwrites` + check), "ask each time" (frontend prompt).

6. **Handle filename length limits**. Windows has a 260-character MAX_PATH limit (or 32K with long path support enabled). If the resolved output path exceeds 260 characters, attempt to shorten the filename (truncate title, use shorter suffix) or warn the user.

7. **Add drag-and-drop URL import**. Allow the user to drag a URL (or a text file containing URLs) onto the app window. Parse and analyze the first URL. For text files, import each valid URL as a separate download.

### Acceptance criteria for file handling

- Playlist downloads show the destination folder structure before starting.
- Partial/incomplete files are cleaned up on cancellation or failure.
- Post-download integrity check (file exists, non-zero size).
- Disk space is checked before download with a user-friendly warning.
- Overwrite behavior is configurable (rename, overwrite, skip).
- Filename length limits are handled gracefully on Windows.

---

## 11. State Management

### Current state findings

**Two Zustand stores**: `download-store.ts` (580 lines) and `settings-store.ts` (36 lines). The settings store is clean — loads on mount, provides `updateSettings`. The download store is the problem.

**Flat namespace in download store**: ~50 properties, all at the top level. No nesting, no slices, no derived state. The store interface (`DownloadStore`) is a flat list of fields and actions. This means:
- No way to reset a subset (e.g., reset progress but keep download options).
- No way to subscribe to a logical domain (e.g., "all playlist state").
- Serialization (for persistence) requires explicit field-by-field mapping.

**State that encodes UI decisions**: `phase` is a string enum that drives 7 rendering branches in `DownloadPage.tsx`. But `phase` doesn't capture all UI state — for example, during playlist download, `phase === "downloading"` but also `playlistItemProgress.length > 0`. The `isPlaylistDownload` computed value (line 22) derives from `playlistItemProgress`, not from a semantic flag.

**State that is never used**: Several store fields are written but never read:
- `downloadSpeed`, `downloadEta` are written by both global and per-item listeners but only `downloadProgress` and `downloadStatus` are used in `DownloadProgress.tsx`. Wait — actually `downloadSpeed` IS used (line 92), and `downloadEta` IS used (line 93). OK, they are used. But they're updated on every progress event, triggering re-renders even when they're not visible.

**State that persists beyond relevance**: After a playlist download completes, the phase returns to `playlist` (line 511). The `playlistItemProgress` is cleared (`[]`). But `downloadItem` and `completedFileName` are also cleared. If the download errors during a playlist, `error` is set but `playlistItemProgress` contains per-item error states — the error phase shows the generic error message from `downloadStatus`, not the per-item failures.

**No computed/derived state**: Values like `canDownload` are computed inline in the component:
```typescript
const canDownload = phase === "ready" && !!dir && !isDownloading;
```
This is fine for a simple computation, but the app has several such inline derivations that should be centralized: "is terminal phase", "is active download", "has analysis data".

**Store actions that are not pure**: `startDownload`, `startPlaylistDownload`, `cancelDownload`, `analyzeUrl` are all side-effect-heavy actions that mix state updates, IPC calls, event subscriptions, and in the case of `startPlaylistDownload`, procedural flow control with polling.

### Concrete target direction

1. **Split the download store by domain**. Use one of these approaches:
   - **Separate Zustand stores**: `useAnalysisStore`, `useOptionsStore`, `useDownloadExecutionStore`, `usePlaylistStore`, `usePresetStore`.
   - **Zustand slices**: Single `create()` call with slice factories. This preserves the cross-slice communication pattern (e.g., `useAnalysisStore` → `useOptionsStore` for duration defaults) while keeping each slice's logic focused.

   Recommended: separate stores, with a custom hook that composes them for easy consumption:
   ```typescript
   // hooks/useDownload.ts
   export function useDownload() {
     const analysis = useAnalysisStore();
     const options = useOptionsStore();
     const execution = useDownloadExecutionStore();
     // return combined API
   }
   ```

2. **Add derived state via Zustand selectors or a separate `computed` layer**. Create selector hooks:
   ```typescript
   export const useIsIdle = () => useStore((s) => s.phase === "idle");
   export const useCanDownload = () => useStore((s) => s.phase === "ready" && !!s.outputDir && !s.isDownloading);
   export const useIsPlaylistBatch = () => useStore((s) => s.playlistItemProgress.length > 0);
   ```

3. **Add proper async action patterns**. Extract side-effect-heavy actions from stores. The store should only expose:
   - Pure state mutations (setters)
   - Async actions that dispatch to external services and then call setters
   The `startPlaylistDownload` should become a service function that receives store accessors:
   ```typescript
   // services/playlist-download.ts
   export async function startPlaylistDownload(
     getState: () => DownloadState,
     setState: (partial: Partial<DownloadState>) => void,
     onItemComplete: (idx: number, result: DownloadResult) => void,
   ) { ... }
   ```
   Or use a hook:
   ```typescript
   // hooks/usePlaylistDownload.ts
   export function usePlaylistDownload() {
     const store = useDownloadExecutionStore();
     const [isRunning, setRunning] = useState(false);
     // encapsulates the entire loop
   }
   ```

4. **Remove stale state**. If a field is written but never consumed outside the store itself, remove it. Audit: `downloadItem` is used in `DownloadProgress` and `cancelDownload`. `completedFileName` is used in `DownloadProgress`. These are valid. But the store also has `formats: FormatInfo[]` which is only used by `buildQualityOptions` — once on analyze, then the result is stored in `qualityOptions`. The raw `formats` field could be dropped after quality options are built.

5. **Standardize on a naming convention for store actions**. Current state: `setUrl`, `analyzeUrl`, `setError`, `setDownloadType`, `setSelectedQuality`, `toggleEntry`, `toggleSelectAll`, `addPreset`, `removePreset`, `selectPreset`, `startDownload`, `startPlaylistDownload`, `cancelDownload`, `reset`, `initProgressListener`. Some actions are camelCase verbs, some include the noun (`toggleEntry`), some don't (`startDownload`). Standardize: `setUrl`, `analyzeUrl`, `setDownloadType`, `togglePlaylistItem`, `toggleSelectAllPlaylist`, `createPreset`, `deletePreset`, `applyPreset`, `executeDownload`, `executePlaylistDownload`, `cancelActiveDownload`, `resetAll`, `initProgressListeners`.

### Acceptance criteria for state management

- The 580-line store is split into focused slices/stores.
- Action-heavy orchestration code lives in hooks or services, not in the store.
- Components use narrow selectors to avoid unnecessary re-renders.
- Derived state (canDownload, isPlaylistBatch, etc.) is centralized.
- Stale/unused state fields are removed.
- Naming conventions are consistent across all stores.

---

## 12. Error Handling, Logging, and Info Messaging

### Current state findings

**Frontend error surfaces**:

1. `DownloadPage.tsx` error phase (lines 112-135): Renders a `<div>` with `border-destructive/50 bg-destructive/10`, the error string, a close button (×), and a "Try Again" button. The error text is whatever the Rust backend returned. See: raw yt-dlp stderr, English mixed with ANSI codes potentially.

2. `VideoInfo.tsx` error display (lines 11-17): Same destructive-styled box, showing `error` from store. Appears during analyzing phase if analysis fails.

3. `UrlInput.tsx` silent catch (line 17): `catch {}` for clipboard read failure. If `navigator.clipboard.readText()` throws (permission denied, no focus), nothing happens. The user clicked the paste button and nothing occurs.

4. `download-store.ts` silent catches: `savePresets` (line 23), `loadPresets` (line 17). If localStorage is full or disabled, presets silently fail.

5. `DownloadProgress.tsx` failed status: Shows `AlertCircle` icon and status text "Failed". The error detail is shown below the filename (line 83-85) by accessing `Object.values(downloadItem.status as object)[0]` — this is an unsafe cast and only works when status is `DownloadStatus::Failed(String)`. For other status variants, it could be empty or throw.

**Backend error handling**:

1. `enqueue_download`: Returns `Result<DownloadItem, String>` — errors are stringified and sent to frontend. `eprintln!` for debug logging.

2. `process_download`: Error handling is inside `'retry` loop:
   - Sidecar spawn failure → immediate error or retry
   - yt-dlp exit code != 0 → captured in `error_lines`, joined with ` | `, included in error message
   - Process cancelled (code -1) → "Cancelled" status, no error details
   - Signal termination → generic "terminated by signal" message

3. `cancel_download`: Returns `Result<bool, String>`. The lock on `active` can fail (poisoned mutex), returning the error string to frontend.

4. `update_ytdlp`: Returns `Result<String, String>`. Network errors, write errors, etc. are all stringified.

**Logging**:

The app uses `eprintln!` (Rust stderr logging) extensively in `download.rs` — every step is logged with `[process_download]` prefix. This is good for debugging but:
- Logs go to stderr, which in Tauri goes to the terminal/console. Not visible to end users.
- No log levels. All logs are equally verbose.
- No structured logging. Everything is formatted strings.
- No log rotation. In production builds (Windows, no console), these logs are lost entirely.
- No frontend-side logging. The frontend has no logger — errors are either displayed to user or silently caught.

**User-facing messaging gaps**:

- No success toast (sonner is imported and set up but never called from components).
- No "analysis complete" notification.
- No "download added to queue" confirmation.
- No progress percentage for playlist analysis (it's either analyzing or done — no intermediate).
- No indication of retry attempts.
- No "N items failed" summary after playlist download.
- No disk space warning.

### Concrete target direction

1. **Implement a logging service**. Create `src/lib/logger.ts`:
   ```typescript
   export const logger = {
     debug: (msg: string, meta?: Record<string, unknown>) => { ... },
     info: (msg: string, meta?: Record<string, unknown>) => { ... },
     warn: (msg: string, meta?: Record<string, unknown>) => { ... },
     error: (msg: string, meta?: Record<string, unknown>) => { ... },
   }
   ```
   - In development: console output with timestamps, colors, structured metadata.
   - In production: can be extended to write to a log file via Tauri command.
   - Replace all `console.log`, `catch {}`, and silent failures with proper `logger.warn()` calls.

2. **On the Rust side, add a Tauri command for logging**. `log_message(level: String, message: String)` — the frontend calls this for remote logging. Or just have the Rust code write to a rotating log file in the app data directory. Use the `log` crate or `tracing`.

3. **Standardize error types on the Rust side**. Instead of `Result<_, String>` everywhere, define an `AppError` enum:
   ```rust
   #[derive(Debug, thiserror::Error)]
   pub enum AppError {
     #[error("yt-dlp sidecar not found: {0}")]
     SidecarNotFound(String),
     #[error("yt-dlp returned an error: {0}")]
     YtDlpError(String),
     #[error("Download failed after {0} attempts: {1}")]
     DownloadFailed(u32, String),
     #[error("FFmpeg error: {0}")]
     FfmpegError(String),
     #[error("Network error: {0}")]
     NetworkError(String),
     #[error("Storage error: {0}")]
     StorageError(String),
   }
   ```
   Implement `serde::Serialize` so Tauri can send it to the frontend. The frontend then pattern-matches on the error variant to show contextual messages.

4. **Add success/info toasts throughout the flow**:
   - "Analysis complete — N items found" (playlist) or "Video ready to download" (single).
   - "Download started — {filename}" (with toast action to open progress view).
   - "Download complete — {filename}" (with toast action to open in explorer).
   - "N playlist items completed — M failed" (summary toast).

5. **Add retry visibility**. When the Rust backend retries a download after failure, emit a progress event with status "Retrying (attempt 2/2)" instead of just "Downloading". The frontend should show this status in the progress card.

6. **Handle the error details display safely**. In `DownloadProgress.tsx` line 84, replace the unsafe `Object.values(...)` cast with a proper accessor:
   ```typescript
   function getStatusError(status: string | Record<string, string>): string {
     if (typeof status === "object" && "Failed" in status) return status.Failed;
     if (typeof status === "object") return Object.values(status)[0] || "";
     return "";
   }
   ```

7. **Add a notification center / log viewer in the UI**. A small bell icon in the header that opens a panel showing recent events (download started, completed, failed, errors). This doubles as a user-facing log.

8. **Log download completion metadata**. When a download completes, log: file path, file size, duration (from video metadata), selected quality, encoding, start time, end time, total bytes downloaded, average speed. This data can power a "download history" feature.

### Acceptance criteria for error handling and logging

- All `catch {}` blocks are replaced with at least `logger.warn(...)`.
- Rust errors are typed (`AppError` enum) and surfaced to frontend with context-appropriate messages.
- The Rust side has a structured logging system with levels (debug/info/warn/error) that writes to a file.
- The frontend has a logger utility replacing all console.log calls.
- Success and info toasts are shown for key state transitions (analysis complete, download started, download completed).
- Retry attempts are visible to the user.
- The unsafe `Object.values(...)` cast is replaced with type-safe access.
- A notification center or event log is accessible from the UI.

---

## 13. Modular Architecture

### Current state findings

**Current folder structure**:
```
src/
  App.tsx
  main.tsx
  styles.css
  vite-env.d.ts
  assets/                          # Template SVGs (dead)
  components/
    download/
      UrlInput.tsx
      VideoInfo.tsx
      DownloadTypeSelector.tsx
      QualitySelector.tsx
      RangeSelector.tsx
      EncodingSelector.tsx
      PresetSelector.tsx
      DestinationSelector.tsx
      DownloadProgress.tsx
      PlaylistSelector.tsx
    layout/                        # Empty
    queue/                         # Empty
    settings/                      # Empty
    ui/                            # 25 shadcn files, only 7 used
  hooks/
    use-mobile.ts                  # Dead (shadcn sidebar hook)
  lib/
    tauri.ts                       # Thin invoke wrappers
    utils.ts                       # cn() + time formatters
  pages/
    DownloadPage.tsx               # The single page
  stores/
    download-store.ts              # God store (580 lines)
    settings-store.ts              # Clean
src-tauri/src/
  main.rs
  lib.rs                           # App builder + handler registration
  commands/
    mod.rs
    analyze.rs                     # analyze_video command
    download.rs                    # enqueue, cancel, get_queue, remove, open_in_explorer
    settings.rs                    # get/save settings
    browse.rs                      # folder picker
    update.rs                      # yt-dlp updater
  models/
    mod.rs                         # All data types + resolve_filename_conflict
    progress.rs                    # yt-dlp + ffmpeg progress parsers
  queue/
    mod.rs                         # DownloadQueue struct
```

**Problems with the current structure**:

1. **No feature-based organization**. Everything download-related is in a flat `components/download/` folder. Components have no clear boundary — `VideoInfo.tsx` is used in the "ready" phase, but its sibling `DownloadTypeSelector.tsx` is also used in the playlist view (via `PlaylistSelector`). The dependency graph is tangled.

2. **Cross-cutting concerns mixed into components**. `DestinationSelector.tsx` picks a folder AND shows a filename preview AND imports settings store. It should only handle "select output destination" — the preview should be a separate component or part of a summary panel.

3. **Dead folders with no content**. `components/layout/`, `components/queue/`, `components/settings/` are empty but their existence implies they had (or were planned to have) features. Any new developer would wonder if they should add files there.

4. **Single page routing bottleneck**. `DownloadPage.tsx` handles everything. Adding a new phase (e.g., "settings", "history") means adding another `if (phase === "settings") return (...)` branch. This doesn't scale.

5. **Backend commands are flat**. All commands are registered in `lib.rs` (line 26-37) as a flat list. Adding a new command means adding its handler function + registration line. No grouping or module-level registration.

6. **No clear feature template**. If someone wants to add a "Download subtitles" feature, where do they put:
   - The UI component? → `components/download/SubtitleSelector.tsx` (adds to the already-full download folder)
   - The store logic? → add to the god store or create a new store?
   - The Rust command? → `commands/download.rs` (already 520 lines) or `commands/subtitles.rs`?
   - The types? → `models/mod.rs` (already 135 lines)?
   There's no established pattern, so the answer depends on who's implementing it.

### Target folder/module structure

The app must be reorganized into feature modules. Each feature is a folder containing everything it needs: components, hooks, types, and optionally its own store slice or data access functions.

**Target structure**:
```
src/
  main.tsx                          # Entry point — minimal
  App.tsx                           # Root layout, theme provider, header, toaster
  styles.css                        # Global styles, theme variables

  features/
    url-input/                      # URL input + paste handler + validation
      UrlInput.tsx
      useUrlAnalysis.ts             # URL validation, auto-analyze, debounce
      UrlInput.test.tsx
      index.ts                      # Re-exports

    video-info/                     # Display analyzed video metadata
      VideoInfo.tsx
      VideoInfoSkeleton.tsx         # Extracted skeleton component
      Thumbnail.tsx                 # Image with loading state
      index.ts

    download-options/               # All download configuration options
      DownloadOptionsPanel.tsx      # Container for all option sections
      DownloadTypeToggle.tsx        # Video+Audio / Audio only
      QualitySelector.tsx
      RangeSelector.tsx
      EncodingSelector.tsx
      DestinationFolder.tsx
      FilenamePreview.tsx           # Extracted from DestinationSelector
      index.ts

    download-execution/             # Single download progress
      DownloadProgressCard.tsx
      CancelButton.tsx
      OpenInExplorerButton.tsx
      RetryButton.tsx
      useSingleDownload.ts          # Hook wrapping startDownload logic
      index.ts

    playlist/                       # Playlist-related functionality
      PlaylistSelector.tsx
      PlaylistItem.tsx
      PlaylistStatusIcon.tsx        # Extracted from PlaylistSelector
      PlaylistProgressBar.tsx
      PlaylistOptions.tsx           # Download type + quality selects for playlist
      PlaylistBatchProgress.tsx     # Overall progress (X of Y, time remaining)
      usePlaylistDownload.ts        # Hook wrapping playlist download orchestration
      index.ts

    presets/                        # Preset management
      PresetSelector.tsx
      PresetSaveDialog.tsx
      PresetList.tsx
      usePresets.ts                 # Preset CRUD hook
      index.ts

    download-history/               # History panel
      HistoryPanel.tsx
      HistoryItem.tsx
      HistoryEmptyState.tsx
      useDownloadHistory.ts
      index.ts

    settings/                       # App settings
      SettingsPage.tsx
      SettingsSection.tsx
      GeneralSettings.tsx
      DownloadDefaults.tsx
      AboutSection.tsx
      useSettings.ts
      index.ts

    notifications/                  # Toast / notification center
      NotificationCenter.tsx
      NotificationToast.tsx
      notificationService.ts
      index.ts

  shared/                           # Shared code used across features
    ui/                             # Reusable design system components (only 7)
      button.tsx
      input.tsx
      label.tsx
      progress.tsx
      select.tsx
      skeleton.tsx
      sonner.tsx
    lib/
      tauri.ts                      # DataService (class-based access layer)
      utils.ts                      # cn, formatDuration, formatDate, time helpers
      encoding-config.ts            # Single source of truth for encodings
      logger.ts                     # Frontend logger
      deferred.ts                   # Promise.withResolvers helper
      store-helpers.ts              # Shared Zustand utilities
    hooks/
      useMediaQuery.ts              # Replaces use-mobile.ts with general hook
      useKeyboardShortcut.ts
      useAbortController.ts

src-tauri/src/
  main.rs                           # Unchanged
  lib.rs                            # App builder — can auto-register modules
  error.rs                          # AppError enum + Serialize impl
  logging.rs                        # Log setup (file rotation, levels)

  features/                         # Mirrors frontend features
    analyze/
      mod.rs                        # analyze_video command
      thumbnail.rs                  # extract_thumbnail (moved from analyze.rs)
    download/
      mod.rs                        # enqueue_download, cancel_download
      process.rs                    # process_download (extracted from download.rs)
      retry.rs                      # Retry logic
      ffmpeg.rs                     # Premiere mode conversion
      cleanup.rs                    # Partial file cleanup
      conflict.rs                   # resolve_filename_conflict (moved from models/mod.rs)
    settings/
      mod.rs                        # get_settings, save_settings
    update/
      mod.rs                        # update_ytdlp
    browse/
      mod.rs                        # browse_folder
    queue/
      mod.rs                        # DownloadQueue struct — kept as core

  models/
    mod.rs                          # Core data types only (VideoMeta, FormatInfo, etc.)
    progress.rs                     # Parse helpers (kept as-is)
```

**Key architectural rules**:

1. **Feature module = self-contained**. Each `features/*/` folder contains ALL the code for that feature. If you want to remove Download History, delete `features/download-history/`. No other file should break.

2. **No cross-feature imports except through `shared/`**. Features can import from `shared/` (ui, lib, hooks) but NOT from other features. If two features need the same thing, it goes in `shared/`.

3. **Stores are per-feature or shared**. Each feature can have its own store slice or hook-based state. Shared state (auth, theme) goes in `shared/stores/`. No god store.

4. **Backend mirrors frontend**. Rust commands are organized by feature. `commands/` folder is replaced with `features/` mirroring the frontend structure.

5. **Index files as public API**. Each feature module exports its public API via `index.ts`. Only what's exported is usable by the rest of the app. Internal components stay private to the module.

6. **New feature template**. To add a new feature:
   - Create `src/features/my-feature/`
   - Add `index.ts` exporting the public API
   - Add components, hooks, types inside
   - If it needs backend support, add `src-tauri/src/features/my-feature/`
   - Register the command in `lib.rs`
   - Done. No other files touched.

### Acceptance criteria for modular architecture

- Every feature has its own bounded folder with all its code.
- Deleting a feature folder doesn't break anything outside it.
- The god store (download-store.ts) no longer exists — split into per-feature stores/hooks.
- Dead folders (layout/, queue/, settings/) are removed.
- Only 7 used shadcn UI files remain in `shared/ui/`.
- Backend commands are organized by feature.
- A documented new-feature template exists (as inline comments in the folder structure).
- `src/App.tsx` imports from feature modules, not flat component paths.

---

## Suggested Execution Order / Phasing

This is a large refactor. Do not attempt everything at once. The following order minimizes breakage at each step:

### Phase 1: Foundation (no external behavior change)
1. Remove dead shadcn UI components (18 files), dead assets (3 SVGs), empty feature directories.
2. Remove the template `README.md` content; replace with a one-liner.
3. Create `shared/lib/logger.ts` and `shared/lib/encoding-config.ts`. Replace existing inline encoding arrays with imports.
4. Create `shared/lib/deferred.ts` (Promise.withResolvers utility).
5. Install dependencies: if adding any package (e.g., `@tanstack/react-virtual`), do it now.
6. Verify the app still builds and runs correctly.

### Phase 2: State management split
1. Identify store slices: analysis, download-options, download-execution, playlist, presets.
2. Extract each slice into its own Zustand store (separate `create()` calls).
3. Create composition hook `features/download-execution/useDownload.ts` that combines stores.
4. Refactor each component to use narrow selectors from the new stores.
5. Remove the old `download-store.ts`.
6. Verify the app still works end-to-end.

### Phase 3: Architecture reorganization
1. Create the feature folder structure (url-input, video-info, download-options, download-execution, playlist, presets, settings, notifications).
2. Move each component into its feature folder. Update imports.
3. Create `index.ts` for each feature.
4. Remove old `components/download/` folder.
5. Verify app builds.

### Phase 4: Rust backend cleanup
1. Create `error.rs` with `AppError` enum. Implement `Serialize`. Update all commands to return `Result<_, AppError>`.
2. Create `features/` structure in Rust. Move code into feature modules.
3. Add file cleanup on cancel/failure.
4. Add startup check for orphaned "Downloading" queue items.
5. Verify app compiles and works.

### Phase 5: UX and interaction improvements
1. Replace `DownloadPage.tsx` phase-gate with a stable layout that animates transitions.
2. Fix the paste/analyze race condition (pass URL directly to `analyzeUrl`).
3. Add toast notifications for key state transitions.
4. Add retry-visibility in progress UI.
5. Replace polling in playlist download with proper deferred pattern.
6. Add URL history (localStorage cache of recent analyses).
7. Fix zero-duration/live stream handling in RangeSelector.
8. Verify every flow: idle → analyze → ready → download → complete; idle → analyze → playlist → batch download; error recovery.

### Phase 6: Visual design overhaul
1. Actually import and configure Geist font.
2. Design and implement a proper type scale.
3. Add surface elevation tokens and shadow tokens.
4. Refactor the RangeSlider to use proper controls (base-ui slider).
5. Replace native checkbox in PlaylistSelector with styled component.
6. Add animations: phase transitions, progress bar shimmer, button press states.
7. Polish dark and light themes with consistent contrast.
8. Redesign the header with theme toggle as a cohesive group.

### Phase 7: Performance and robustness
1. Virtualize playlist list for large playlists.
2. Debounce progress events (Rust side throttling, frontend rAF batching).
3. Add parallel playlist downloads with configurable concurrency.
4. Add disk space check before download.
5. Add post-download file verification.
6. Wire up `show_all_formats` setting to quality selector.
7. Add download speed limit option.

### Phase 8: Settings and history
1. Build a Settings page/panel with all existing AppSettings fields + new options.
2. Build Download History panel showing all completed/failed downloads.
3. Add persistent download queue visibility.
4. Add analysis caching (in-memory TTL cache).
5. Add output file existence tracking to history.

---

## Final Acceptance Checklist

Before considering the work done, verify EVERY item:

### UI / Visual
- [ ] Font loads correctly (Geist or chosen font) across the app.
- [ ] Type scale is intentional and creates clear hierarchy.
- [ ] Color palette has surface elevation: background < card < popover are visually distinct.
- [ ] Dark and light themes are both polished with adequate contrast.
- [ ] Range slider is keyboard-accessible, touch-friendly, and matches the design.
- [ ] Phase transitions are animated (fade/slide, not instant swap).
- [ ] At least 3 micro-interactions exist (button press, progress glow, card mount).
- [ ] Playlist items have hover/focus states.
- [ ] Empty state (idle page) has a welcome message, not just an input.
- [ ] Loading state (analyzing) has meaningful skeleton layout.

### UX / Interaction
- [ ] URL input is always mounted (doesn't remount on phase change).
- [ ] `setTimeout(analyze, 50)` hack is removed — URL is passed directly.
- [ ] Paste button works silently (no catch{} that swallows errors).
- [ ] Error state preserves user's settings (doesn't reset everything).
- [ ] Download queue/history is visible somewhere in the UI.
- [ ] Playlist quality/encoding options are data-driven or clearly labeled as presets.
- [ ] Playlist batch **can be cancelled** mid-download.
- [ ] Retry for failed downloads doesn't require re-pasting URL.

### Functionality
- [ ] Retry is transparent (no "Failed" flash before retry).
- [ ] ffmpeg conversion progress is visible in UI.
- [ ] Polling in playlist download is replaced with deferred/event-based completion.
- [ ] URL input is debounced (~400ms) and validates URL format.
- [ ] Download size is estimated when filesize is null (from bitrate × duration).
- [ ] yt-dlp binary is verified before use; shows clear error if missing.
- [ ] Partial files are cleaned up on cancel/failure.

### Persistence
- [ ] Settings survive app restart.
- [ ] Presets survive app restart.
- [ ] Theme preference survives app restart.
- [ ] Download history is persisted and visible in the UI.
- [ ] Analysis results are cached (at least in-memory).
- [ ] On restart, in-flight "Downloading" items from previous session are marked as failed.

### Streaming
- [ ] Rust-side progress emission is throttled (max ~10/sec).
- [ ] Frontend batches progress updates via requestAnimationFrame.
- [ ] Global and per-item progress events don't conflict during playlists.
- [ ] Event listeners are cleaned up correctly (no double-registration, no leaks).

### Performance
- [ ] Components use narrow Zustand selectors (no full-store subscriptions).
- [ ] Playlist with > 50 entries uses virtualized rendering.
- [ ] Unused shadcn components are removed (only 7 remain).
- [ ] Template assets (SVGs) are removed.

### Configurability
- [ ] Settings page exists and all 4 AppSettings fields have UI controls.
- [ ] Concurrency limit for playlist downloads is configurable.
- [ ] Download speed limit is settable.
- [ ] Output filename pattern is configurable.
- [ ] Quality selector supports filtering/sorting.

### Design Patterns
- [ ] God store (download-store.ts) is split into 3-6 focused stores/slices.
- [ ] Download orchestration (playlist loop) lives in a hook or service, not a store.
- [ ] Encoding configuration has a single source of truth (encoding-config.ts).
- [ ] DataService class wraps all Tauri invoke calls.
- [ ] No polling loops exist — all async completion uses promises/events.

### Edge Cases
- [ ] Empty URL shows inline validation.
- [ ] Zero-duration/live streams don't show NaN in UI (RangeSelector hidden).
- [ ] Concurrent analyze requests cancel the previous request.
- [ ] Missing sidecars (yt-dlp, ffmpeg) show clear user-facing error with action button.
- [ ] Rapid download clicks are guarded (button disabled immediately).
- [ ] Large playlists (500+ entries) don't freeze the UI.
- [ ] Output directory deletion between analysis and download is handled gracefully.

### File Handling
- [ ] Playlist download shows destination folder path before starting.
- [ ] Partial files are cleaned up on cancellation.
- [ ] Post-download integrity check (file exists, size > 0).
- [ ] Disk space is checked before download; warning if insufficient.
- [ ] Overwrite behavior is configurable.
- [ ] Filename length limits handled on Windows.

### State Management
- [ ] No store exceeds 200 lines.
- [ ] Components use derived state selectors (useCanDownload, etc.).
- [ ] Stale/unused state fields are removed.
- [ ] Store actions use consistent naming conventions.

### Error Handling / Logging
- [ ] No `catch {}` blocks remain (all have at least `logger.warn()`).
- [ ] Rust errors use typed `AppError` enum (not raw `String`).
- [ ] Rust has structured logging with levels (debug/info/warn/error).
- [ ] Frontend has a logger utility.
- [ ] Toasts shown for: analysis complete, download started, download completed, download failed.
- [ ] Retry attempts shown in UI status text.
- [ ] Unsafe `Object.values(...)` cast in DownloadProgress is replaced.

### Modular Architecture
- [ ] Feature folders exist with bounded code (no cross-feature imports).
- [ ] Deleting any feature folder doesn't break the app.
- [ ] Dead folders (layout, queue, settings) are removed.
- [ ] Rust commands are organized by feature.
- [ ] New feature can be added by creating one folder + registering one command.

### Build
- [ ] `cargo check` passes with no warnings.
- [ ] `npx tsc --noEmit` passes with no errors.
- [ ] `npx vite build` produces a successful build.
- [ ] `cargo tauri build` (or dev) runs without crashes.
- [ ] App works end-to-end: paste URL → analyze → configure → download → verify file on disk.
- [ ] Playlist flow works end-to-end: paste → analyze → select → download batch → verify files.
