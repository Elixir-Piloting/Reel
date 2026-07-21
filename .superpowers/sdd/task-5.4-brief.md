### Task 5.4: Replace polling with deferred pattern

**Files:**
- Modify: `src/features/playlist/` — replace `setTimeout(check, 200)` polling

In `startPlaylistDownload` or the `usePlaylistDownload` hook, replace the polling loop:

```typescript
import { Deferred } from '../../shared/lib/deferred';
import { listen } from '@tauri-apps/api/event';

// For each playlist item:
const deferred = new Deferred<void>();
const unsub = await listen<DownloadItem>('download-item-update', (e) => {
  if (e.payload.id === itemId && ['completed', 'failed', 'cancelled'].includes(e.payload.status)) {
    deferred.resolve();
  }
});
await deferred.promise;
unsub();
```

- [ ] **Replace polling** — use Deferred + Tauri events in playlist download loop.
- [ ] **Verify** playlist downloads complete without polling.

