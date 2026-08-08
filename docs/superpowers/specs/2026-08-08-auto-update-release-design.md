# Design: Auto-update + release pipeline

**Date:** 2026-08-08
**Status:** Approved

## Summary

Give ytmate (Tauri v2, Windows) the same distribution story clippy already
has: a `npm run release` command that bumps the version, updates the configs,
builds + signs the NSIS installer, tags, and publishes a GitHub release **to
the source repo itself** (`Elixir-Piloting/Reel`) along with an `update.json`
manifest. The app checks for updates on startup (skipped in dev), installs,
and relaunches; the Settings page shows version/update status.

## Background / Current State

- Tauri v2 + npm + React 19 + Vite frontend. productName `Reel`, version
  `0.1.0`, identifier `com.dog.reel`.
- `src-tauri/tauri.conf.json` `bundle.targets: "all"`, no `plugins.updater`.
- `src-tauri/Cargo.toml` has no updater plugin. `package.json` has no updater
  JS plugin and no `release` script.
- Repo `Elixir-Piloting/Reel` is **private**, default branch `master`.
- Version lives in three places: `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json` (all `0.1.0`); `Cargo.lock` holds `reel` root pkg
  version too.
- Reference implementation: clippy `scripts/release.mjs` (bump -> build ->
  sign -> git commit/tag/push -> `gh` release -> update.json) and its
  startup/settings updater wiring.

## Architecture

### 1. Release command — `scripts/release.mjs` via **`npm run release`**

- Refuse to run if the working tree is dirty.
- Read current version from `src-tauri/Cargo.toml`.
- Bump kind: **patch by default** (no prompt); optional arg `major`/`minor`.
  `resolveKind(arg)` and `nextVersion(current, kind)` exported for tests.
- Write the new version into `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`.
- Load signing secrets: `TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env vars, else `.release-secrets.json`
  (gitignored) `{ privateKeyPath, privateKeyPassword }`.
- `npm run tauri build` with signing env -> NSIS bundle
  `src-tauri/target/release/bundle/nsis/Reel_<v>_x64-setup.exe`, then
  `npm run tauri signer sign` stamps `.sig` (the build does not always emit it).
- On any build/sign failure: restore the previous version into all four files
  so the tree stays clean for a re-attempt; rethrow.
- `git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  src-tauri/tauri.conf.json`, `git commit -m "chore: release v<v>"`, `git push`.
- `git tag v<v>`, `git push origin v<v>`.
- Publish to the **same repo** `Elixir-Piloting/Reel`:
  - `gh release delete v<v> --repo ... --yes` (idempotent, `||` tolerated).
  - `gh release create v<v> --repo ... --title "Reel v<v>" --notes "Reel v<v>"`.
  - `gh release upload v<v> --repo ... --clobber <exe> <sig>`.
- Publish `update.json` via contents API to the repo's **`master`** branch:
  `{ version, notes, pub_date, platforms: { "windows-x86_64": { url, signature } } }`.
  Overwrite requires the existing file's SHA; bootstrap path for an empty repo
  is not applicable (repo already has commits) but kept harmless.

`bundle.targets` in `tauri.conf.json` is narrowed from `"all"` to `"nsis"` so
only the updater-compatible installer is produced.

### 2. One-time setup (pre-flight, run once)

- Make the repo public: `gh repo edit Elixir-Piloting/Reel --visibility public`.
- Add `.release-secrets.json` to `.gitignore`.
- Generate a Tauri updater keypair locally
  (`npm run tauri signer generate`; env `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
  - Public key -> `src-tauri/tauri.conf.json` `plugins.updater.pubkey`.
  - Private key file + password -> local `.release-secrets.json` (never
    committed). User supplies the password once at generation time.

### 3. App-side updater

- Dependencies:
  - `tauri-plugin-updater = "2"` (Cargo) -> keep version range loose.
  - `@tauri-apps/plugin-updater` (JS, npm).
- `src-tauri/src/lib.rs`: register
  `.plugin(tauri_plugin_updater::Builder::new().build())` after the existing
  `tauri_plugin_fs` plugin.
- `src-tauri/src/lib.rs` setup: register an `app:restart` listener that calls
  `app.restart()`.
- `src-tauri/tauri.conf.json`:
  - `plugins.updater.endpoints` ->
    `["https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/update.json"]`.
  - `plugins.updater.pubkey` — generated public key.
  - `plugins.updater.windows.installMode` = `"passive"`.
- `src-tauri/capabilities/default.json`: add `"updater:default"`.
- Flow on frontend mount (skipped in dev):
  1. `check()` for a newer version.
  2. If newer: `downloadAndInstall()`.
  3. Emit `app:restart`; Rust listener relaunches.
- Settings page (`src/features/settings/SettingsPage.tsx`): new "Version &
  Updates" card using `getVersion` from `@tauri-apps/api/app`:
  - Shows installed `v0.x.y`.
  - Status line: "Checking for updates…" / "Up to date" / "Update available:
    vA.B.C" / "Version info unavailable".
  - A "Check now" button that runs the same check and, if available, shows an
    install action; installing calls `downloadAndInstall` then emits
    `app:restart`.

## Decisions

- **Approach A (Tauri updater + same-repo release commcmd)** chosen: copy the
  proven clippy `scripts/release.mjs` flow but target the source repo, not a
  separate release repo. `gh` handles auth via its own keyring.
- **Local release only, no CI** — matches clippy's shipped state; the command
  does the full build/sign locally.
- **Endpoint via raw.githubusercontent.com `master` branch** — the source repo's
  default branch is `master` (clippy uses `main` on its separate repo).
- **installMode `"passive"`** — small progress UI without user interaction.
- **NSIS only** — single installer, smoothest auto-update on Windows.
- **Patch default, no prompt** — `npm run release` is fully non-interactive for
  the common flow.
## Error Handling

- Update check failures (network, invalid signature, no manifest) non-fatal —
  log and continue; the app still runs.
- Release script aborts on dirty tree or git failure before partial state; any
  build/sign failure restores the previous version.
- `gh release delete` of a prior same-name release is idempotent.
- `update.json` contents-API overwrite handles the sha-not-found case.

## Testing

- `npm run tauri build` still produces a working NSIS build with signing env
  unset (updater plugin is stateless until configured).
- `npx vitest` (not installed yet; skip) — instead verify `nextVersion` logic
  via a one-off `node scripts/release.mjs --help`-style eval if desired.
- Manual (after setup): run `npm run release`, confirm version bump in all
  three files + Cargo.lock, commit, push, tag; release appears in
  `Elixir-Piloting/Reel` with `Reel_<v>_x64-setup.exe` + `.sig` + `update.json`.
- Manual updater test: install a prior build, run the newer build, confirm the
  app detects/installs/relaunches on start.