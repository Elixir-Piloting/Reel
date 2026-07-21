### Task 1.4: Remove unused npm dependencies

**Files:**
- Modify: `package.json` — remove unused deps

Unused deps to remove: `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@tanstack/react-table`, `next-themes`, `recharts`, `tailwindcss-animate`, `tw-animate-css`, `zod`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`.

- [ ] **Remove unused packages** from `package.json` dependencies.
- [ ] **Run `npm install`** to update lockfile.
- [ ] **Verify build** — `npx tsc --noEmit` and `npx vite build` pass.

---

## Phase 2: State Management Split

Split the 580-line `download-store.ts` into five focused stores: analysis, download-options, download-execution, playlist, presets.

