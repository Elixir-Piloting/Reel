# Reel

**Paste a URL. Reel it in.**

Reel is a fast, lightweight desktop video downloader for **Windows x64**, built with
[Tauri v2](https://tauri.app), React 19 and TypeScript on top of `yt-dlp` and `ffmpeg`.
Paste any supported URL, inspect the video or playlist, pick a quality and format, and
download — with a native-feeling UI, a real download queue, and automatic tool management
under the hood.

> **Status:** Beta — actively developed. Works great for YouTube; most other
> `yt-dlp`-supported sites work too. Windows is the only supported target.

---

## Highlights

- **Fetch & inspect** — pasting (or typing) a URL shows a video card with thumbnail,
  duration, channel, upload date, all available qualities/sizes, and even lets you trim a
  time range before downloading.
- **Playlists** — paste a playlist/channel, pick individual videos (select all / toggle),
  and download them with configurable concurrency.
- **Format & quality control** — video (MP4 H.264 / H.265, MKV, WebM) or audio
  (MP3, M4A/AAC, FLAC, Opus, WAV), per-height quality options, and an optional
  "show all formats" mode.
- **Premiere-compatible mode** — re-encode output to H.264/AAC so it drops straight into
  Adobe Premiere.
- **Presets & URL history** — save your favorite type/encoding/premiere combo and quickly
  re-open previously analyzed links.
- **Real download queue** — a dedicated Downloads page with live progress (%, speed, ETA),
  pause / resume / cancel / retry, pause-all & cancel-all, and search. Queue survives
  restarts (`queue.json`).
- **Notifications** — in-app toasts when analysis finishes, a playlist is found, or a
  download completes/fails (with quick *Open* / *Retry* actions).
- **Cookies support** — drop in a `cookies.txt` so logged-in YouTube content downloads
  without rate-limiting.
- **Self-maintaining tools** — `yt-dlp` and `ffmpeg` ship with the app and are updated
  automatically (yt-dlp on launch, ffmpeg weekly), with a manual "Update now" in Settings.
- **Auto-update** — checks for new releases and prompts before installing.
- **Themed, custom title bar** — light / dark / system themes with a soft "clay" aesthetic
  and a frameless window.

---

## Requirements

**To build / contribute (not to run the shipped app):**

- **Windows 10/11 x64** — the only target currently configured
- [Node.js](https://nodejs.org) 18+ and `npm`
- [Rust](https://rustup.rs) toolchain (stable) with the `msvc` target
- Git

The app bundles its own `yt-dlp` / `ffmpeg`, so **no system installs are required** — for
either users or developers.

---

## Getting Started

### Run the released app

1. Grab the latest `Reel_<version>_x64-setup.exe` from the
   [Releases](https://github.com/Elixir-Piloting/Reel/releases) page.
2. Run the installer (NSIS). No other dependencies are needed.

### Develop locally

```bash
git clone https://github.com/Elixir-Piloting/Reel.git
cd Reel
npm install
npm run tauri dev
```

This launches Vite on `http://localhost:1420` with HMR, compiles the Rust backend, and
opens the app window.

### Build a local (un-released) bundle

```bash
npm run build        # typecheck + Vite build
npm run tauri build  # compile Rust + produce the NSIS installer
```

> **Note:** `yt-dlp`/`ffmpeg` are bundled as Tauri sidecars in `src-tauri/binaries/`.
> These are **git-ignored**; a fresh clone needs them present before the installer will
> function (see [Managing the bundled binaries](#managing-the-bundled-binaries)).

---

## Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Start the Vite dev server (used by `tauri dev`) |
| `npm run build` | Typecheck (`tsc`) then build the frontend to `dist/` |
| `npm run preview` | Preview the built frontend |
| `npm run tauri` | Tauri CLI passthrough (`tauri build`, `tauri dev`, …) |
| `npm run release` | **Full release pipeline** — see [Releases](#auto-update--releases) |

---

## Auto-Update & Releases

Reel ships with a working end-to-end release + auto-update pipeline:

- Releases are published from the **source repo itself**
  (`Elixir-Piloting/Reel`, default branch `master`), not a separate repo.
- `npm run release [patch|minor|major]` (defaults to `patch`) does everything in one shot:

  1. Fails if the working tree is dirty.
  2. Bumps `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
  3. Runs `npm run tauri build` (producing `Reel_<version>_x64-setup.exe`).
  4. Signs the installer with `tauri signer` (minisign) using the updater key.
  5. Commits, pushes, tags `vX.Y.Z` and pushes the tag.
  6. Creates/overwrites a GitHub Release and uploads the installer **and** its `.sig`.
  7. Writes a fresh `update.json` (version, notes, URL, signature) back to `master`.

- The updater endpoint is
  `https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/update.json`
  (configured in `src-tauri/tauri.conf.json` → `plugins.updater`).

- At startup (production builds only — skipped during `npm run tauri dev`) the app checks
  for an update. If one exists it shows a **"New update available"** dialog with
  *Update Now* / *Update Later*; *Update Now* first warns if downloads are in progress
  (offering to cancel them), then installs and restarts. A manual *Check / Restart &
  install* option also lives in **Settings → Version & Updates**.

### Release prerequisites

- A gitignored `.release-secrets.json` containing `{ "privateKeyPath, privateKeyPassword }`
  (or the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env vars).
- The minisign private key whose **public** key is embedded in `tauri.conf.json`.
- [`gh`](https://cli.github.com) CLI authenticated (used for GitHub Releases + `update.json`).

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full release walkthrough.

---

## Managing the Bundled Binaries

`yt-dlp` and `ffmpeg` live in **two** places:

- **`src-tauri/binaries/`** — the repo copies bundled into the installer
  (git-ignored, wired via `externalBin` + `resources` in `tauri.conf.json`).
- **`%APPDATA%\com.dog.reel\bin\`** — the **runtime** copies the app actually runs. On
  first launch the app bootstraps them from the bundle into this folder.

Behavior:

- **yt-dlp** — checked on every launch (respecting the *Auto-update yt-dlp on launch*
  setting, on by default). Downloads are SHA-256-verified when the release notes include a
  hash.
- **ffmpeg** — opportunistically updated on a ~7-day cadence (tracked in
  `binaries-meta.json`); the BtbN Windows build ZIP is downloaded, extracted, smoke-tested,
  then atomically swapped.
- Both swap via temp-file + `.bak` so a failed download never bricks a working binary, and
  all update failures are **silent and non-blocking** (the app keeps running on whatever it
  already has).
- **Settings → Download Defaults** shows both tool versions + status and a *Update now*
  button for manual refreshes.

---

## App Data Locations (Windows)

Everything lives under `%APPDATA%\com.dog.reel\`:

| Path | Holds |
| ---- | ----- |
| `bin\` | Runtime `yt-dlp.exe`, `ffmpeg.exe` (`.bak`/`.tmp` during swaps) |
| `settings.json` | Download folder, cookies path, auto-update, concurrency, filename pattern |
| `queue.json` | Persistent download queue (atomic-write `.tmp` + recover-on-start) |
| `cookies.txt` | Your pasted/imported cookies |
| `binaries-meta.json` | Last ffmpeg check day / tag |
| `logs\reel.log` | App + yt-dlp runtime logging |
| _default output_ | `%USERPROFILE%\Downloads\REEL\` |

Logs are flushed to a file via a Rust-side `log_to_file` command plus Rust `log_info` /
`log_error` helpers.

---

## Architecture

Reel is a standard **Tauri v2** split: a Rust core driving `yt-dlp`/`ffmpeg` subprocesses,
and a React SPA talking to it over Tauri commands and events.

### Backend (`src-tauri/`)

- **`src/binaries.rs`** — owns binary paths, bootstrapping from the bundle, version
  parsing/comparison, the `BinaryStatus` state, and both update flows.
- **`src/commands/`** — all IPC surface:
  - `analyze.rs` — runs `yt-dlp -J --flat-playlist` to produce video/playlist metadata and
    format lists (with a small set of purity-tested parsers).
  - `download.rs` — the queue. `enqueue_download` pushes an item and spawns an async worker
    (gated by a 3-way semaphore), streams `yt-dlp`/`ffmpeg` output, emits throttled progress,
    retries once without thumbnails, supports pause/resume/cancel, and persists the queue.
  - `settings.rs` — `settings.json` read/write + cookie file helpers.
  - `browse.rs` — folder / cookies-file pickers, `open_in_explorer`.
  - `update.rs` — fetches latest yt-dlp / ffmpeg release metadata + thin command wrappers.
- **`src/queue/`** — in-memory `DownloadQueue` (`Vec<DownloadItem>`) behind a `Mutex`.
- **`src/models/`** — serde DTOs shared with the frontend, plus a `progress.rs` parser for
  `yt-dlp` `[download]` lines and ffmpeg `time=` lines.
- **`src/error.rs`** — a single `AppError` enum propagated to the UI.
- **`src/logging.rs`** — file + stderr logging.

### Frontend (`src/`)

- **State: zustand** stores (`stores/`) — `analysis`, `options`, `download-execution`,
  `playlist`, `settings`, `preset`, `theme`, `binary-status`. Analysis/download/option
  stores persist to `localStorage`.
- **Pages:** `DownloadPage` (analyze → options → download), `DownloadsPage` (queue/history
  with search + bulk actions), `SettingsPage`.
- **Features:** `features/` holds cohesive smarts — `url-input`, `video-info`,
  `download-options` (quality/encoding/range/premiere/destination), `playlist`,
  `download-execution`, `download-history`, `notifications`, `presets`, `settings`,
  `updater`, `promos`.
- **UI kit:** `components/ui/` (shadcn-style primitives: button, input, select, dialog,
  alert-dialog, tooltip…), `components/layout/` (custom `TitleBar` + `RootLayout` sidebar),
  plus a Claymorphism-flavored design system in `styles.css` with light/dark CSS variables.
- **IPC:** all backend calls go through `shared/lib/data-service.ts`; real-time updates
  arrive via `download-progress`, `download-item-update`, and `binary-status` events.

### Data flow (download)

```
paste URL → analyze_video (yt-dlp -J)
          → quality/encoding/premiere/trim selected
          → enqueue_download → queue + async worker (semaphore: 3)
          → yt-dlp streams progress → download-progress events
          → (optional) premiere mode → ffmpeg H.264/AAC re-encode
          → queue item → Completed/Failed/Cancelled → notifications
```

---

## Project Structure

```
├── src/                     # React 19 frontend
│   ├── App.tsx              # router + startup update check
│   ├── components/          # ui kit + layout (TitleBar, RootLayout)
│   ├── features/            # per-capability modules
│   ├── pages/               # DownloadPage / DownloadsPage
│   ├── shared/lib/          # data-service, types, encoding-config, logger…
│   ├── stores/              # zustand stores
│   └── styles.css           # design tokens + Tailwind v4
├── src-tauri/               # Rust backend
│   ├── src/                 # lib.rs, binaries, commands, queue, models, logging
│   ├── binaries/            # bundled yt-dlp / ffmpeg (git-ignored)
│   ├── capabilities/        # permission capabilities
│   └── tauri.conf.json      # app + bundle + updater config
├── scripts/release.mjs      # npm run release pipeline
├── docs/superpowers/        # design specs + implementation plans
├── EDGE_CASES.md            # failure-point / triage audit
├── promos.json              # remote sidebar promo feed
└── update.json              # auto-update manifest (regenerated on release)
```

---

## Tech Stack

| Layer | Tech |
| ----- | ---- |
| Shell | Tauri v2 (Wry/WebView2) |
| Backend | Rust 2021, tokio, serde, reqwest, zip, tauri-plugins (shell, dialog, fs, updater, opener) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| State | zustand (persist → `localStorage`) |
| Routing | react-router-dom (`HashRouter`) |
| UI icons/fonts | Phosphor + Lucide, Outfit variable font |
| Media engine | `yt-dlp` + `ffmpeg` |
| Distribution | NSIS installer + minisign-signed auto-update |

---

## Troubleshooting

- **"YouTube is rate-limiting this IP"** — export your logged-in
  [cookies.txt](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
  and set it under **Settings → Download Defaults → YouTube cookies**.
- **"No downloadable formats found"** — the video may be a livestream, members-only, or
  geo-blocked; try a different URL.
- **Missing/corrupt `yt-dlp` or `ffmpeg`** — check **Settings → Download Defaults →
  Download tools** and hit *Update now*; the app also self-heals on the next launch.
- **Where are my logs?** — `%APPDATA%\com.dog.reel\logs\reel.log`.
- **Where do files land by default?** — `%USERPROFILE%\Downloads\REEL\`. Change it in
  **Settings → Download Folder** or per-download via *Save To*.

For a deep-dive on known weak points and edge cases, see [`EDGE_CASES.md`](EDGE_CASES.md).

---

## Contributing

Contributions are welcome. Please read
**[`CONTRIBUTING.md`](CONTRIBUTING.md)** first — it covers the dev workflow, code
conventions, testing, and the release process.

---

## License

No license file is currently included — **all rights reserved** by default. Reach out if
you'd like to reuse this code.
