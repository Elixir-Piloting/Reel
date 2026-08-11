# Reel Promos Carousel — Design

Date: 2026-08-11

## Summary

Show a small carousel of promo cards at the bottom of the app sidebar, directly
above the theme picker. The promo content is a JSON feed hosted in the current
`Elixir-Piloting/Reel` repo (public raw URL, same pattern as `update.json`), so
promos can be edited without shipping an app update.

## JSON contract

New file at repo root: `promos.json`. Top-level array of promo objects:

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

- `type` — `"image"` (default when missing) or `"video"`. Controls how
  `media_url` is rendered.
- `media_url` — the media asset for the card: an image when `type` is
  `"image"`, a video when `type` is `"video"` (must be `https:`; CSP allows
  `img-src https:` and `media-src https:`).
- `title` — short card title.
- `body` — one-line description.
- `link` — destination URL opened in the default browser.
- `active` — if `false`, the promo is ignored.

Only promos with `active === true` are rendered.

## Fetching

- Source URL: `https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json`
- Fetched once when the layout mounts; request uses `cache: "no-store"` so a
  launch always gets the latest feed (no stale 5-minute HTTP cache).
- Invalid JSON, fetch failure, or zero active promos → the section is hidden
  entirely. No error toast, no placeholder, no dead space.

## Component

New file `src/features/promos/PromoCarousel.tsx`, mounted in `RootLayout.tsx`
inside the existing `mt-auto` block, immediately above `<ThemePicker size="sm" />`
(currently at `src/components/layout/RootLayout.tsx:101-103`).

Implementation:

- Fetch promos on mount; filter `active === true`.
- Render a single card at a time.
- Auto-advance every ~6s; pause while the pointer is over the carousel.
- Video promos (`type: "video"`) do NOT wait 6s — a mute-d, control-less
  `<video>` autoplays (playsInline, muted) and advances to the next promo on
  `ended`/`onError`. Image promos keep the 6s timer.
- Dot indicators + prev/next arrow buttons for manual navigation. A single
  promo renders as a static card with no controls.
- Card layout: a plain `div` with `border-4 border-background rounded-md` and
  `bg-surface`. The media (image or video, `w-full aspect-[4/3] rounded-md
  object-cover`) sits above the text block; below it a text `div`
  (`mt-2 px-3 pb-3`) holds the title and one-line body. No gradient overlay
  and no external-link icon. The entire card is clickable (a `div` with
  `role="button"`) and opens the link; if the media fails to load it is hidden
  (images) or skipped (videos) and the card shows just the text.
- Click → `openUrl(promo.link)` from `@tauri-apps/plugin-opener` (already an
  installed dependency with `opener:default` permission).

## Styling

Match the existing sidebar design language using the established utilities in
`src/styles.css`: `clay-sunken`, `inset-highlight`, `accent-glow`, `bg-surface`,
`text-muted-foreground`. Reuse radius tokens (`--radius-md` etc.). No new theme
tokens required.

## Config changes

- `src-tauri/tauri.conf.json` CSP: add `connect-src https:` so the webview can
  `fetch()` the raw URL, and `media-src https:` so video promos can play.
  `img-src 'self' https:` already permits remote images.
- No capability/permission changes needed (`opener:default` already present).

## Out of scope

- Auth/private hosting (repo stays public so the raw URL is anonymous-readable).
- Periodic refresh while the app is running.
- Click-tracking/analytics.
- Dismiss/persistent-hide behavior.
