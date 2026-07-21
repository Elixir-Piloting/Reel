### Task 5.3: Add toast notifications

**Files:**
- Modify: `src/features/notifications/notificationService.ts` — create notification service
- Modify: `src/App.tsx` — ensure `<Toaster />` is present

Add sonner toast calls at key state transitions:
- Analysis complete (single video)
- Analysis complete (playlist, N items)
- Download started
- Download complete (with "Open in Explorer" action)
- Download failed (with "Retry" action)

```typescript
// src/features/notifications/notificationService.ts
import { toast } from 'sonner';

export const notify = {
  analysisComplete: (title: string) => toast.success('Analysis complete', { description: title }),
  playlistFound: (count: number) => toast.info(`Playlist found`, { description: `${count} items ready to download` }),
  downloadStarted: (title: string) => toast.loading('Download started', { description: title, id: 'download' }),
  downloadComplete: (title: string, onOpen: () => void) =>
    toast.success('Download complete', { description: title, action: { label: 'Open', onClick: onOpen } }),
  downloadFailed: (title: string, error: string, onRetry: () => void) =>
    toast.error('Download failed', { description: error, action: { label: 'Retry', onClick: onRetry } }),
};
```

- [ ] **Create `notificationService.ts`** with toast notification functions.
- [ ] **Wire notifications** into download start/complete/fail flows in the store/hooks.
- [ ] **Verify** toasts appear at each state transition.

