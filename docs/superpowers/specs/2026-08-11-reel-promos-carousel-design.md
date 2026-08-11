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
    "image_url": "https://yoursite.com/promos/murmur.png",
    "title": "Try Murmur",
    "body": "Hands-free voice dictation for Windows.",
    "link": "https://murmur.freyo.app",
    "active": true
  }
]
```

- `image_url` — banner image (must be `https:`; CSP allows `img-src https:`).
- `title` — short card title.
- `body` — one-line description.
- `link` — destination URL opened in the default browser.
- `active` — if `false`, the promo is ignored.

Only promos with `active === true` are rendered.

## Fetching

- Source URL: `https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json`
- Fetched once when the layout mounts (fresh each app launch; no cache layer).
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
- Dot indicators + prev/next arrow buttons for manual navigation. A single
  promo renders as a static card with no controls.
- Card layout: aspect ratio 4:3, full-bleed — the image covers the entire
  card (`absolute inset-0 object-cover`). A gradient overlay (`bg-gradient-to-t
  from-surface to-transparent`) sits over the image with `inset-highlight`
  applied to it; the card keeps the `border-2 border-background` clay border.
  Title and body text sit at the bottom over the surface-tinted gradient, with
  a subtle external-link affordance. The entire card is clickable. If the
  image fails to load it is hidden and the card falls back to the plain
  `bg-surface` with text.
- Click → `openUrl(promo.link)` from `@tauri-apps/plugin-opener` (already an
  installed dependency with `opener:default` permission).

## Styling

Match the existing sidebar design language using the established utilities in
`src/styles.css`: `clay-sunken`, `inset-highlight`, `accent-glow`, `bg-surface`,
`text-muted-foreground`. Reuse radius tokens (`--radius-md` etc.). No new theme
tokens required.

## Config changes

- `src-tauri/tauri.conf.json` CSP: add `connect-src https:` so the webview can
  `fetch()` the raw URL. `img-src 'self' https:` already permits remote images.
- No capability/permission changes needed (`opener:default` already present).

## Out of scope

- Auth/private hosting (repo stays public so the raw URL is anonymous-readable).
- Periodic refresh while the app is running.
- Click-tracking/analytics.
- Dismiss/persistent-hide behavior.
