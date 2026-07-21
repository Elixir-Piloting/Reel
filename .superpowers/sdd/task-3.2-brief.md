### Task 3.2: Create `DataService` and `tauri.ts` refactor

**Files:**
- Create: `src/shared/lib/data-service.ts`
- Modify: remove old `src/lib/tauri.ts` (move types to a types file)

```typescript
// src/shared/lib/data-service.ts
import { invoke } from '@tauri-apps/api/core';
import type { AnalyzeResponse, DownloadItem, AppSettings } from './types';

class DataService {
  async analyzeVideo(url: string): Promise<AnalyzeResponse> {
    return invoke<AnalyzeResponse>('analyze_video', { url });
  }

  async enqueueDownload(req: DownloadRequest): Promise<DownloadItem> {
    return invoke<DownloadItem>('enqueue_download', { request: req });
  }

  async cancelDownload(id: string): Promise<boolean> {
    return invoke<boolean>('cancel_download', { id });
  }

  async getQueue(): Promise<DownloadItem[]> {
    return invoke<DownloadItem[]>('get_queue');
  }

  async removeFromQueue(id: string): Promise<boolean> {
    return invoke<boolean>('remove_from_queue', { id });
  }

  async openInExplorer(path: string): Promise<void> {
    return invoke<void>('open_in_explorer', { path });
  }

  async browseFolder(): Promise<string | null> {
    return invoke<string | null>('browse_folder');
  }

  async getSettings(): Promise<AppSettings> {
    return invoke<AppSettings>('get_settings');
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    return invoke<void>('save_settings', { settings });
  }

  async updateYtdlp(): Promise<string> {
    return invoke<string>('update_ytdlp');
  }
}

export const dataService = new DataService();
```

- [ ] **Create `data-service.ts`** with the full DataService class.
- [ ] **Move type definitions** from `src/lib/tauri.ts` to `src/shared/lib/types.ts`.
- [ ] **Update all invoke calls** in the app to use `dataService` instead of raw `invoke`.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

---

## Phase 4: Rust Backend Cleanup

