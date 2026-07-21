# Task 1.4: Remove unused npm dependencies

**Status:** ✅ Complete

## Changes

- **`package.json`** — Removed 14 unused dependencies:
  `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`,
  `@tanstack/react-table`, `next-themes`, `recharts`, `tailwindcss-animate`,
  `tw-animate-css`, `zod`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`,
  `@radix-ui/react-switch`, `@radix-ui/react-tabs`
- **`src/components/ui/sonner.tsx`** — Replaced `next-themes` `useTheme` import with a
  `theme` prop (the app uses its own `localStorage`-based theme system in `App.tsx`)
- **`src/App.tsx`** — Passes `theme` state to `<Toaster />`

## Verification

- `npm install` — ✅ removed 54 packages
- `npx tsc --noEmit` — ✅ no errors
- `npx vite build` — ✅ built successfully (6.46s)

## Commit

`394fddc` — `chore: remove unused npm dependencies`
