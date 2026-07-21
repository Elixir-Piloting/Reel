### Task 5.1: Stabilize layout — remove phase-gate pattern

**Files:**
- Modify: `src/pages/DownloadPage.tsx` — rewrite as stable layout with `UrlInput` always mounted

Replace the if-else phase tree with a layout where:
- `UrlInput` is always at the top
- Content sections mount/unmount with animation wrappers (CSS animate + `display: none`)
- Phase logic controls visibility, not mounting

```typescript
function DownloadPage() {
  const phase = useAnalysisStore((s) => s.phase);
  // ...
  return (
    <div className="...">
      <UrlInput />
      <AnimatePresence>
        {phase === 'analyzing' && <VideoInfoSkeleton />}
        {phase === 'ready' && <DownloadOptionsPanel />}
        {phase === 'playlist' && <PlaylistSelector />}
        {(phase === 'downloading' || phase === 'completed') && <DownloadProgressCard />}
        {phase === 'error' && <ErrorBanner />}
      </AnimatePresence>
    </div>
  );
}
```

Wrapper `AnimatePresence` is a CSS animation container (not Framer Motion — use CSS transitions with `animate-fadeIn`/`animate-fadeOut` to avoid adding the dependency):

```typescript
function AnimatePresence({ children }: { children: React.ReactNode }) {
  return <div className="transition-all duration-300 ease-out">{children}</div>;
}
```

- [ ] **Rewrite `DownloadPage.tsx`** with stable layout + CSS animations.
- [ ] **Remove phase-if-else-tree** — UrlInput always mounted.
- [ ] **Verify build** — app no longer unmounts/remounts elements on phase change.

