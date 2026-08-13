# Contributing to Reel

Thanks for wanting to help build Reel! This guide covers how to get set up, the conventions
we follow, how to test your changes, and how to ship a release.

> **Read me first** — this is a small, focused project. If you read one document, read
> [`README.md`](README.md) for the "what/why" and this one for the "how".

---

## Table of Contents

1. [Development environment](#development-environment)
2. [Repository layout](#repository-layout)
3. [Workflow](#workflow)
4. [Code conventions](#code-conventions)
   - [Frontend](#frontend)
   - [Backend (Rust)](#backend-rust)
   - [Git & commits](#git--commits)
5. [Testing](#testing)
6. [Design specs & plans](#design-specs--plans)
7. [The release pipeline (`npm run release`)](#the-release-pipeline)
8. [Security & secrets](#security--secrets)
9. [Questions](#questions)

---

## Development environment

Prerequisites (see [README → Requirements](README.md#requirements)):

- Windows 10/11 x64
- Node.js 18+ and `npm`
- Rust stable (MSVC toolchain)
- Git

Recommended VS Code extensions (declared in `.vscode/extensions.json`):

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

One-time setup:

```bash
git clone https://github.com/Elixir-Piloting/Reel.git
cd Reel
npm install
```

> **Binaries:** the app's `yt-dlp`/`ffmpeg` live in `src-tauri/binaries/` (git-ignored).
> A fresh clone won't have them, so the first `npm run tauri dev` will report missing tools
> until you drop copies in (see [Managing the bundled binaries](README.md#managing-the-bundled-binaries)
> and the [security note](#security--secrets) below). The app writes runtime copies to
> `%APPDATA%\com.dog.reel\bin\` and self-heals from there on launch.

---

## Repository layout

```
src/            React 19 frontend (pages, features, stores, components, shared/lib)
src-tauri/      Rust backend (commands, queue, models, binaries, logging) + Tauri config
scripts/        release.mjs (release pipeline)
docs/superpowers/plans + specs   design & implementation docs (see below)
EDGE_CASES.md   failure-point / triage audit — read before touching risky paths
```

The frontend and backend are coupled through Tauri **commands** and **events**. The complete
IPC surface is declared once in `src-tauri/src/lib.rs` (`invoke_handler`) and mirrored in
`src/shared/lib/data-service.ts` + `src/shared/lib/types.ts`.

---

## Workflow

1. **Open an issue first** for anything non-trivial so we can align before you write code.
2. Create a branch from `master` (see [Git & commits](#git--commits) for naming).
3. Make small, focused commits.
4. Run the [verification checks](#testing) before pushing.
5. Open a pull request back into `master` and describe what/why + how you tested it.

Keep changes small. A PR that mixes an unrelated refactor with a feature is harder to review
and more likely to be split or bounced.

---

## Code conventions

Follow the existing style — match the file you're in.

### Frontend

- **TypeScript strict-leaning.** Always type your zustand stores, props, and event payloads
  against the shared types in `src/shared/lib/types.ts`.
- **State lives in zustand stores**, not component-local state, when more than one component
  needs it (see `src/stores/`). Persist cross-session UI state with the `persist` middleware;
  keep ephemeral/transient state out of persistence (`partialize`).
- **Feature-first organization.** New capabilities go in a folder under `src/features/`
  (e.g. `src/features/my-thing/`), with an `index.ts` re-exporting the public API.
- **Reusable UI** belongs in `src/components/ui/` (shadcn-style primitives). Build app
  screens from these — don't hand-roll buttons/inputs/dialogs with raw HTML.
- **Use the design system**, never magic colors or literals. Reference tokens via Tailwind
  utilities mapped from `styles.css` (`bg-surface`, `text-muted-foreground`, `inset-highlight`,
  `clay-sunken`, `accent-glow`, `border-background`, radius tokens, etc.). Both light and
  dark variants must keep working.
- **Don't bypass the datalayer.** The backend is called exclusively through
  `shared/lib/data-service.ts`; real-time updates come via Tauri `listen` events.
- **No new comments unless they explain a non-obvious *why*.** Prefer self-documenting code.
- **Error handling** — use `toErrorMessage`-style normalization (see `analysis-store.ts`)
  so backend errors surface as readable strings, and route user-visibility through
  `features/notifications/notificationService.ts` (`notify.*` toasts).

### Backend (Rust)

- Modules mirror the command surface; keep `lib.rs` as the single registration point.
- Return `Result<_, AppError>` (see `src-tauri/src/error.rs`) and let Tauri serialize it.
  Don't invent ad-hoc error strings.
- All subprocess/IPC/queue mutations should be defensive about locking and failures —
  use `lock_mutex`-style recovery, always `save_queue` after mutating the queue, and never
  leave a `Downloading`/`Converting` item stranded (emit a terminal event).
- Add `#[cfg(test)]` unit tests for pure logic (parsers, version comparison, filename
  handling, DTO parsing). See `binaries.rs`, `analyze.rs`, `models/progress.rs`.
- Prefix log lines with a `[module]` tag via `crate::logging::{log_info, log_error}` — it
  makes `reel.log` scannable.
- Prefer the `binaries` module (`ytdlp_path`/`ffmpeg_path`) over hard-coded paths.

### Git & commits

- **Branch naming:** `feature/<slug>`, `fix/<slug>`, `chore/<slug>` (e.g. `fix/playlist-cancel`).
- **Commit style:** conventional commits — match the existing history:
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`. Use the imperative mood, keep the subject
  under ~72 chars (`feat: add premiere-compatible toggle to download page`).
- Commit the **why**, not just the what; reference related issues where relevant.
- Stage intentionally — never `git add -A` blindly (watch out for
  [secrets](#security--secrets) and build artifacts).

---

## Testing

There are **two** layers. Run both before you push, and mention what you ran in the PR.

```bash
# 1. Rust unit tests (all existing #[cfg(test)] modules)
cargo test --manifest-path src-tauri/Cargo.toml

# 2. Frontend typecheck + production build
npm run build        # runs `tsc && vite build`
```

- **No JS test framework is currently configured**, so frontend correctness is verified via
  `tsc` + a manual `npm run tauri dev` pass.
- Backend verification is unit-test + compile (`cargo build`) driven.
- Manual smoke checklist for download changes:
  1. `npm run tauri dev`.
  2. Paste a single-video URL → analyze → download (video and audio).
  3. Paste a playlist URL → select a few → download (with concurrency > 1).
  4. Exercise cancel / pause / resume / retry and confirm the queue page reflects state.
  5. Toggle Premiere-compatible mode and confirm the re-encode runs.
- If you change the UI, sanity-check **both** light and dark themes.

> Manual runtime verification of the auto-updater (update dialog, install + restart)
> requires a real release build and a published `update.json` — see
> [`docs/superpowers/specs/2026-08-12-update-prompt-dialog-design.md`](docs/superpowers/specs/2026-08-12-update-prompt-dialog-design.md)
> for the manual test script.

---

## Design specs & plans

This repo uses a **spec-driven** workflow. Significant features get two documents under
`docs/superpowers/` before (or alongside) implementation:

- **`specs/<date>-<slug>-design.md`** — the *what* and *why*: problem statement, current
  flow, proposed design, verification steps.
- **`plans/<date>-<slug>.md`** — the task-by-task *how* (checkboxes, exact files/lines,
  verification commands).

If you're implementing a feature, **write (or link) a design spec first**. Track progress in
your PR. Triage-style analyses of existing risk live in [`EDGE_CASES.md`](EDGE_CASES.md) —
update it when you discover or fix a failure point.

---

## The release pipeline

Releases are handled almost entirely on the source repo (`Elixir-Piloting/Reel`) by:

```bash
npm run release          # patch bump, no prompt
npm run release minor    # minor bump
npm run release major    # major bump
```

`scripts/release.mjs` (see [README → Auto-Update & Releases](README.md#auto-update--releases))
will, in order: fail on a dirty tree → bump all three version files → `npm run tauri build`
→ sign the NSIS installer → commit/tag/push → publish a GitHub Release + `.sig` → write
`update.json` back to `master`.

**When / who:** only run this from a clean `master` when you're confident the change-set is
release-worthy. The script needs the [release prerequisites](README.md#release-prerequisites)
(a gitignored `.release-secrets.json` or the signing env vars, and an authenticated `gh`).

**Do not** hand-edit version numbers or `update.json` — the script owns them.

---

## Security & secrets

Treat these as absolute rules:

- **Never commit** `.release-secrets.json`, `minisign-private.key`, or `minisign-private.key.pub`
  (already git-ignored). They are release/signing secrets.
- The minisign **public** key embedded in `src-tauri/tauri.conf.json` is safe to commit —
  it's the *verification* key, not the private one.
- `src-tauri/binaries/` is git-ignored because it contains downloaded executables. If you
  add binaries locally, don't try to force them into history.
- Be conservative adding new Tauri **permissions/capabilities** (`src-tauri/capabilities/`)
  — prefer the narrowest grant that works.
- The app runs `yt-dlp`/`ffmpeg` as subprocesses. Any change to argument construction,
  URL handling, or filename sanitization is security-sensitive — review it carefully and
  see [`EDGE_CASES.md`](EDGE_CASES.md) (§1, §4.3, §12) for known concerns.

---

## Questions

Open an issue, or if it's a design-level question, draft a spec in `docs/superpowers/specs/`
and we can discuss it there. Please search existing issues before filing a new one.
