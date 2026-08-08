# Auto-Update + Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ytmate (`Elixir-Piloting/Reel`) clippy's distribution story but with releases published to the **source repo itself**: a `npm run release` command that bumps the version, boots the NSIS build, signs it, commits/tags/pushes, and publishes a GitHub Release + `update.json` in the same repo — plus startup update-check/install and a Settings version card.

**Architecture:** Copy `scripts/release.mjs` from clippy verbatim, adapted: release repo = `Elixir-Piloting/Reel` (default branch `master`), npm instead of pnpm, `productName` `Reel` installer name, patch-by-default with no prompt. Register `tauri-plugin-updater` in Rust + JS, wire endpoints/pubkey/installMode in `tauri.conf.json`, emit `app:restart` after install (Rust-side listener relaunches), and add a "Version & Updates" card to the Settings page.

**Tech Stack:** Tauri v2, Rust, React 19, Vite, npm (not pnpm), GitHub CLI `gh`, minisign via `tauri signer`.

## Global Constraints

- Release repo: `Elixir-Piloting/Reel` (made public) — the **source repo itself**, not a separate repo.
- `update.json` lives on the repo's default branch: `master` (NOT `main`).
- Updater endpoint: `https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/update.json`.
- Installer: NSIS only (`bundle.targets = "nsis"`), file `Reel_<version>_x64-setup.exe`.
- Updater window install mode: `passive`.
- Version bump is the full flow: bump `package.json` + `Cargo.toml` + `tauri.conf.json` (and commit `Cargo.lock` after build) -> commit -> push -> tag `vX.Y.Z` -> push tag. **Patch by default, no prompt.** Optional arg `major` / `minor`.
- No CI workflows; `npm run release` does everything locally. `gh` uses its own keyring auth.
- Signing secrets: `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env vars or gitignored `.release-secrets.json` `{ privateKeyPath, privateKeyPassword }`.
- Frontend update check skipped in dev (`import.meta.env.DEV`).
- Update-check failures are non-fatal (log, keep app running).
- Do not add `tauri-plugin-process`; restart via a Rust-side `app:restart` listener.
- No vitest in ytmate; verify the version-math with one-off `node --input-type=module -e` checks.
- `.release-secrets.json` must be gitignored (add if missing).

---

### Task 1: One-time release infrastructure (public repo, keypair, gitignore)

**Files:**
- Modify: `.gitignore`
- Modify: `src-tauri/tauri.conf.json` (add `plugins.updater.pubkey`; full block finished in Task 3)
- Create (local, gitignored): `.release-secrets.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a real public repo, an updater keypair, and the `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` values resolvable from `.release-secrets.json` for Task 2+.

- [ ] **Step 1: Make the repo public**

Run: `gh repo edit Elixir-Piloting/Reel --visibility public`
Expected: prints confirmation; `gh repo view Elixir-Piloting/Reel --json visibility` shows `"PUBLIC"`.

- [ ] **Step 2: Add `.release-secrets.json` to `.gitignore`**

In `.gitignore`, under `*.local`, add:
```
# Local release secrets (never commit)
.release-secrets.json
```

- [ ] **Step 3: Generate the updater signing keypair**

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<STRONG_PASSWORD>"
npm run tauri signer generate -- --force
```
Expected: a private key file path is printed (default `minisign-private.key` in cwd; `--force` overwrites if present). Copy the printed public key (base64, starts `RWR...` or similar minisign `untrusted comment` line).

- [ ] **Step 4: Write `.release-secrets.json`**

Create `.release-secrets.json`:
```json
{
  "privateKeyPath": "C:\\dev\\tauri\\ytmate\\minisign-private.key",
  "privateKeyPassword": "<STRONG_PASSWORD>"
}
```
(Adjust the private key file path to wherever Step 3 wrote it. The password is used by every release; guard it.)

- [ ] **Step 5: Put the public key into `tauri.conf.json`**

Watch Read `src-tauri/tauri.conf.json`, then add the `plugins.updater.pubkey` block (Task 3 fills in `endpoints`):
```json
  "plugins": {
    "updater": {
      "pubkey": "<PUBLIC_KEY_FROM_STEP_3>",
      "windows": {
        "installMode": "passive"
      }
    }
  },
```
(If the `plugins` key doesn't exist yet, add it after the `app` block. `endpoints` is filled in Task 3 – see Task 3 Step 1. Verify JSON parse: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'))"`.)

- [ ] **Step 6: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore release secrets"
```
(`.release-secrets.json` and the private key are intentionally NOT staged, and the tauri.conf.json pubkey edit is staged in a later task; commit only `.gitignore` here.)

---

### Task 2: Release script — `scripts/release.mjs` + `npm run release`

**Files:**
- Create: `scripts/release.mjs`
- Modify: `package.json` (add `release` script)
- Modify: `src-tauri/tauri.conf.json` (narrow `bundle.targets` to `"nsis"`)

**Interfaces:**
- Consumes: `src-tauri/Cargo.toml`, `package.json`, `src-tauri/tauri.conf.json`, `.release-secrets.json` (Task 1), `gh` CLI auth.
- Produces: `npm run release` (patch default, optional arg) that bumps all version files, runs `npm run tauri build` + `npm run tauri signer sign`, commits/tags/pushes, and publishes a Release + `update.json` to `Elixir-Piloting/Reel@master`. Exports `nextVersion` and `resolveKind`.

- [ ] **Step 1: Write `scripts/release.mjs`**

Create `scripts/release.mjs` with the full clippy flow, adapted:
- `RELEASE_REPO = "Elixir-Piloting/Reel"`
- installer searched is `Reel_${next}_x64-setup.exe` (+ `.sig`) in `src-tauri/target/release/bundle/nsis/`
- build via `npm run tauri build`; sign via `npm run tauri signer sign "<exePath>"`
- no README bootstrap needed (source repo already has commits), but keep the empty-repo guard harmless
- use `gh` (not `p.npm`)
- write version into `package.json`, `Cargo.toml`, `tauri.conf.json`; `Cargo.lock` gets its root-package version updated automatically during the build and is committed

```js
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const CARGO = resolve(ROOT, "src-tauri/Cargo.toml");
const PKG = resolve(ROOT, "package.json");
const TAURI = resolve(ROOT, "src-tauri/tauri.conf.json");
const RELEASE_REPO = "Elixir-Piloting/Reel";
const SECRETS_FILE = resolve(ROOT, ".release-secrets.json");

const KINDS = ["major", "minor", "patch"];

function run(cmd, opts = {}) {
  const res = spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true, ...opts });
  if (res.status !== 0) throw new Error(`${cmd}\nfailed (exit ${res.status}).`);
  return "";
}

function runOk(cmd, opts = {}) {
  const res = spawnSync(cmd, { cwd: ROOT, encoding: "utf8", shell: true, ...opts });
  return (res.stdout || "").trim();
}

function readVersion() {
  const cargo = readFileSync(CARGO, "utf8");
  const m = cargo.match(/^version = "(\d+\.\d+\.\d+)"/m);
  if (!m) throw new Error(`cannot parse version from ${CARGO}`);
  return m[1];
}

export function nextVersion(current, kind) {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (kind) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`unknown bump kind: ${kind}`);
  }
}

export function resolveKind(arg) {
  if (!arg) return "patch";
  const kind = arg.toLowerCase();
  if (!KINDS.includes(kind)) {
    throw new Error(`unknown bump kind: ${kind} (expected one of ${KINDS.join(", ")})`);
  }
  return kind;
}

function writeVersion(version) {
  const cargo = readFileSync(CARGO, "utf8");
  writeFileSync(CARGO, cargo.replace(/^version = "\d+\.\d+\.\d+"/m, `version = "${version}"`));

  const pkg = JSON.parse(readFileSync(PKG, "utf8"));
  pkg.version = version;
  writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);

  const tauri = JSON.parse(readFileSync(TAURI, "utf8"));
  tauri.version = version;
  writeFileSync(TAURI, `${JSON.stringify(tauri, null, 2)}\n`);
}

function loadSecrets() {
  let file = {};
  if (existsSync(SECRETS_FILE)) file = JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
  const key =
    process.env.TAURI_SIGNING_PRIVATE_KEY ||
    (file.privateKeyPath && existsSync(file.privateKeyPath) ? readFileSync(file.privateKeyPath, "utf8") : "") ||
    "";
  const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || file.privateKeyPassword || "";
  if (!key) throw new Error(
    "updater signing private key not found. Set TAURI_SIGNING_PRIVATE_KEY (or privateKeyPath) " +
    `or create ${SECRETS_FILE} with { privateKeyPath, privateKeyPassword }.`);
  if (!password) throw new Error(
    "updater signing password not found. Set TAURI_SIGNING_PRIVATE_KEY_PASSWORD " +
    `or create ${SECRETS_FILE} with privateKeyPassword.`);
  return { key, password };
}

function bundleFiles(version) {
  const dir = resolve(ROOT, "src-tauri/target/release/bundle/nsis");
  if (!existsSync(dir)) throw new Error(`bundle dir not found: ${dir}`);
  if (~[null, undefined].indexOf(dir)) throw new Error(`bundle dir type error: ${dir}`); // guard
  const names = readdirSync(dir);
  const exe = names.find((n) => n === `Reel_${version}_x64-setup.exe`);
  const sig = names.find((n) => n === `${exe}.sig`);
  if (!exe) throw new Error(`installer Reel_${version}_x64-setup.exe not found in ${dir}`);
  if (!sig) throw new Error(`signature for ${exe} not found; did signing run?`);
  return { dir, exe, sig };
}

function publishToReleases(version, { dir, exe, sig }) {
  const tag = `v${version}`;
  const exePath = resolve(dir, exe);
  const sigPath = resolve(dir, sig);

  // source repo already has commits; keep the empty-repo bootstrap only as a guard
  const commits = runOk(`${ghAuth()} api /repos/${RELEASE_REPO}/commits`);
  if (commits.trim() === "[]") {
    runOk(`${ghAuth()} api -X PUT /repos/${RELEASE_REPO}/contents/README.md -f message="initial commit: bootstrap" -f content="${Buffer.from("Reel release artifacts and update manifest\n\n", "utf8").toString("base64")}"`);
  }

  runOk(`${ghAuth()} release delete ${tag} --repo ${RELEASE_REPO} --yes`);
  run(`${ghAuth()} release create ${tag} --repo ${RELEASE_REPO} --title "Reel v${version}" --notes "Reel v${version}"`);
  run(`${ghAuth()} release upload ${tag} --repo ${RELEASE_REPO} --clobber "${exePath}" "${sigPath}"`);

  const manifest = {
    version,
    notes: `Reel v${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        url: `https://github.com/${RELEASE_REPO}/releases/download/${tag}/${exe}`,
        signature: readFileSync(sigPath, "utf8").trim(),
      },
    },
  };
  const content = Buffer.from(JSON.stringify(manifest)).toString("base64");
  const existing = runOk(`${ghAuth()} api /repos/${RELEASE_REPO}/contents/update.json -q .sha`);
  const shaArg = existing && existing !== "404" ? ` -f sha="${existing.trim()}"` : "";
  run(`${ghAuth()} api -X PUT /repos/${RELEASE_REPO}/contents/update.json -f message="Update manifest for v${version}" -f content="${content}"${shaArg}`);
}

function ghAuth() {
  return "gh";
}

function main(argv) {
  const kind = resolveKind(argv[2]);
  const dirty = runOk("git status --porcelain");
  if (dirty) throw new Error("Working tree is not clean. Commit or stash before releasing.");

  const current = readVersion();
  const next = nextVersion(current, kind);
  console.log(`Releasing ${current} -> ${next} (${kind}).`);

  const { key, password } = loadSecrets();
  const signEnv = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password };

  writeVersion(next);
  console.log("Bumped versions. Building installer...");

  const nsisDir = resolve(ROOT, "src-tauri/target/release/bundle/nsis");
  const exeFile = `Reel_${next}_x64-setup.exe`;
  const exePath = resolve(nsisDir, exeFile);
  let bundle;
  try {
    run("npm run tauri build", { env: signEnv });
    console.log("Signing installer...");
    run(`npm run tauri signer sign "${exePath}"`, { env: signEnv });
    bundle = bundleFiles(next);
  } catch (e) {
    writeVersion(current);
    throw e;
  }

  console.log(`Built + signed bundle: ${bundle.exe}`);
  runOk("git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json");
  run(`git commit -m "chore: release v${next}"`);
  run("git push");
  run("git tag v" + next);
  run(`git push origin v${next}`);
  publishToReleases(next, bundle);
  console.log(`Released v${next}. Installer + update.json published to ${RELEASE_REPO}.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    main(process.argv);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
```

> **Note for the implementer:** the helper names below (`runOk`, `ghAuth`) match clippy's `scripts/release.mjs` — copy that file's `publishToReleases` / `loadSecrets` / `run` shapes faithfully, changing only: `RELEASE_REPO`, the `pnpm` → `npm run` command strings, the installer prefix `clippy_` → `Reel_`, and the README base64 bootstrap (use the guard as written, it is a no-op on a repo with commits).

- [ ] **Step 2: Add the `release` script to `package.json`**

Add to `scripts`:
```json
    "release": "node scripts/release.mjs"
```

- [ ] **Step 3: Narrow bundle targets to NSIS**

In `src-tauri/tauri.conf.json`, change `"targets": "all"` to `"targets": "nsis"`.

- [ ] **Step 4: Verify version math with one-off node eval**

Run: `node --input-type=module -e "import('file:///C:/dev/tauri/ytmate/scripts/release.mjs').then(m => console.log(m.nextVersion('0.1.0','minor'), m.resolveKind(''))))"`
Expected: `0.2.0 patch`

- [ ] **Step 5: Commit**

```bash
git add scripts/release.mjs package.json src-tauri/tauri.conf.json
git commit -m "feat: add npm run release version-bump + publish script"
```

---

### Task 3: Configure updater in Rust, JS deps, capabilities, endpoint

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `tauri-plugin-updater`)
- Modify: `package.json` (add `@tauri-apps/plugin-updater`)
- Modify: `src-tauri/tauri.conf.json` (add `endpoints`)
- Modify: `src-tauri/capabilities/default.json` (add `updater:default`)

**Interfaces:**
- Consumes: the public key from Task 1 Step 3.
- Produces: `plugins.updater.endpoints` config; the Rust + JS plugin crates available for Task 4.

- [ ] **Step 1: Add the Rust updater dependency**

In `src-tauri/Cargo.toml`, after `tauri-plugin-fs = "2"`:
```toml
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Add the JS updater dependency**

Run: `npm install @tauri-apps/plugin-updater`
Expected: `@tauri-apps/plugin-updater` appears under `dependencies` in `package.json` (and `package-lock.json`).

- [ ] **Step 3: Add the endpoint to `tauri.conf.json`**

Set `plugins.updater.endpoints` in the existing `plugins.updater` block created in Task 1:
```json
    "endpoints": [
      "https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/update.json"
    ],
```

- [ ] **Step 4: Add the updater permission to capabilities**

In `src-tauri/capabilities/default.json`, append to `permissions`:
```json
    "updater:default"
```

- [ ] **Step 5: Verify builds in dev**

Run: `npm run tauri build --no-bundle` (or `npm run tauri dev` if build proves heavy)
Expected: compiles (the updater plugin is registered only in Task 4, so it's inert now).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml package.json package-lock.json src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: add updater dependencies and config"
```

---

### Task 4: Register plugins, app:restart listener (Rust)

**Files:**
- Modify: `src-tauri/src/lib.rs` (imports, `.plugin()`, `.setup()`)

**Interfaces:**
- Consumes: `tauri_plugin_updater` (Task 3); `tauri::Emitter` (already used indirectly in `commands/download.rs`, needed in `lib.rs`).
- Produces: the updater registered on the builder; `emit("app:restart")` from the frontend triggers `AppHandle::restart()`.

- [ ] **Step 1: Add imports to `src-tauri/src/lib.rs`**

Add near the top (after `use tauri::...` if needed):
```rust
use tauri::Emitter;
use tauri::Manager;
```
(The file already uses `AppHandle`/`Manager` in some commands; a top-level `Emitter` import may be new.)

- [ ] **Step 2: Register the updater plugin**

In the builder, after `.plugin(tauri_plugin_fs::init())`:
```rust
        .plugin(tauri_plugin_updater::Builder::new().build())
```

- [ ] **Step 3: Add the `app:restart` listener in `setup`**

In the `.setup(move |app| { ... })` closure, before `Ok(())`:
```rust
            let app_handle = app.handle().clone();
            app_handle.listen("app:restart", move |_| {
                let _ = app_handle.restart();
            });
```

- [ ] **Step 4: Compile**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register tauri updater plugin and restart listener"
```

---

### Task 5: Frontend — startup update check + Settings "Version & Updates" card

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `check()` from `@tauri-apps/plugin-updater`, `emit` from `@tauri-apps/api/event`, `getVersion` from `@tauri-apps/api/app`, `app:restart` handled by Rust (Task 4).
- Produces: auto-install + relaunch on startup (non-dev); a "Version & Updates" Settings card.

- [ ] **Step 1: Add the startup updater check in `src/App.tsx`**

In `App` (the router component), add a `useEffect`:
```tsx
import { useEffect } from "react";
import { emit } from "@tauri-apps/api/event";

export default function App() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          await update.downloadAndInstall();
          emit("app:restart");
        }
      } catch (e) {
        console.error("[updater] check failed", e);
      }
    })();
  }, []);

  return <RouterProvider router={router} />;
}
```
(`emit("app:restart")` matches the Rust listener from Task 4.)

- [ ] **Step 2: Add the "Version & Updates" card in `src/features/settings/SettingsPage.tsx`**

Add a new stateful card using `SettingsCard` (import it if not already) at the END of the settings list:
```tsx
import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";

function UpdatesCard() {
  const [installed, setInstalled] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "current">("idle");
  const [latest, setLatest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setInstalled)
      .catch(() => setInstalled(null));
  }, []);

  const scan = async () => {
    if (import.meta.env.DEV) return;
    setStatus("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setLatest(update.version);
        setStatus("available");
      } else {
        setStatus("current");
      }
    } catch {
      setStatus("idle");
    }
  };

  const install = async () => {
    if (import.meta.env.DEV) return;
    setBusy(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        emit("app:restart");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title="Version & Updates">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-y-0.5">
          <span className="text-sm font-medium">Reel v{installed ?? "?"}</span>
          <span className="text-muted-foreground text-sm">
            {status === "checking" && "Checking for updates…"}
            {status === "available" && `Update available: v${latest}`}
            {status === "current" && "Up to date"}
            {status === "idle" && "Version info unavailable"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button onClick={scan} disabled={busy}>Check again</Button>
          {status === "available" && (
            <Button onClick={install} disabled={busy}>Install updates</Button>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
```
Then render `<UpdatesCard />` before the closing `</div>` of the returned layout. Confirm `SettingsCard` and `Button` are imported (Button already is).

- [ ] **Step 3: Typecheck**

Run: `npm run build` (tsc + vite) or `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/features/settings/SettingsPage.tsx
git commit -m "feat: auto-update on startup and version card in settings"
```

---

### Task 6: Final local verification

**Files:** none.

- [ ] **Step 1: Full static check**

Run: `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: both pass.

- [ ] **Step 2: Local NSIS smoke build (keys unset)**

Run: `npm run tauri build`
Expected: builds an NSIS installer under `src-tauri/target/release/bundle/nsis/` (installing-only, no signature without secrets — that's fine).

- [ ] **Step 3: Manual end-to-end release (report-only, optional until user runs it)**

Run: `npm run release` (or `npm run release -- minor`).
Expected: versions bump in all files, builds + signs, commits `chore: release vX.Y.Z`, pushes, tags `vX.Y.Z`, deletes/creates GitHub Release `vX.Y.Z` in `Elixir-Piloting/Reel`, uploads `Reel_<v>_x64-setup.exe` + `.sig`, commits `update.json` to `master`.
(Not actually executed in this task — belongs to the implementer's manual run.)

---

## Self-Review

**Spec coverage:**
- Public repo / same-repo releases -> Task 1 Step 1, `RELEASE_REPO` constant. ✓
- `master` branch endpoint -> update.json URL + commit target. ✓
- NSIS-only -> Task 2 Step 3, Task 6 Step 2. ✓
- Passive install -> Task 1 Step 5. ✓
- Local release script, no CI -> Task 2. ✓
- Prompt fallback (env or `.release-secrets.json`) -> Task 1 + `loadSecrets`. ✓
- Startup check + Settings card -> Task 5. ✓
- `app:restart` Rust listener -> Task 4 Step 3. ✓
- Error-handling cancel just realized: restore-version-on-failure -> Task 2 script. ✓
- Non-fatal update checks -> Task 5 catch. ✓

**Placeholder scan:** `.release-secrets.json` `STRONG_PASSWORD` is the one runtime secret supplied by the user at generation; the `.pubkey` placeholder in Task 1 is filled from the same step's output. No TBDs. The one planned hint about `runOK` vs `runOk` is resolved in the final code (Task 2 explicitly renames it to `runOk`).

**Type consistency:** `nextVersion(current, kind)` and `resolveKind(arg)` signatures are identical between Task 2's eval and the script; `update.version` matches clippy UI; `emit("app:restart")` matches Rust listen name.**Save:**
```bash
git add docs/superpowers/plans/2026-08-08-auto-update-release.md
git commit -m "docs: auto-update + release implementation plan"
```
`