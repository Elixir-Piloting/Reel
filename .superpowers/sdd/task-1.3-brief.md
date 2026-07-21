### Task 1.3: Create shared utilities

**Files:**
- Create: `src/shared/lib/logger.ts`
- Create: `src/shared/lib/deferred.ts`
- Create: `src/shared/lib/encoding-config.ts`

**Details:**
- `src/shared/lib/logger.ts`: A simple logger with `debug/info/warn/error` methods. In dev mode uses `console` with timestamp prefixes. Production mode no-ops or can write to a Tauri command.
- `src/shared/lib/deferred.ts`: Wraps `Promise.withResolvers()` or a manual polyfill.
- `src/shared/lib/encoding-config.ts`: Single source of truth for video/audio encoding options. Exports `encodingConfig` with `video[]` and `audio[]` arrays containing `{ key, label, ext, mergeFormat?, audioFormat?, embedThumbnail? }`.

```typescript
// src/shared/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  if (!isDev && level === 'debug') return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta) fn(`${prefix} ${msg}`, meta);
  else fn(`${prefix} ${msg}`);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
```

```typescript
// src/shared/lib/deferred.ts
export class Deferred<T = void> {
  promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}
```

```typescript
// src/shared/lib/encoding-config.ts
export interface VideoEncoding {
  key: string;
  label: string;
  ext: string;
  mergeFormat: string;
}

export interface AudioEncoding {
  key: string;
  label: string;
  ext: string;
  audioFormat: string;
  embedThumbnail: boolean;
}

export const encodingConfig = {
  video: [
    { key: 'mp4_h264', label: 'MP4 (H.264)', ext: 'mp4', mergeFormat: 'mp4' },
    { key: 'mp4_h265', label: 'MP4 (H.265/HEVC)', ext: 'mp4', mergeFormat: 'mp4' },
    { key: 'mkv', label: 'MKV', ext: 'mkv', mergeFormat: 'mkv' },
    { key: 'webm', label: 'WebM', ext: 'webm', mergeFormat: 'webm' },
  ],
  audio: [
    { key: 'mp3', label: 'MP3', ext: 'mp3', audioFormat: 'mp3', embedThumbnail: true },
    { key: 'm4a', label: 'M4A (AAC)', ext: 'm4a', audioFormat: 'aac', embedThumbnail: true },
    { key: 'flac', label: 'FLAC', ext: 'flac', audioFormat: 'flac', embedThumbnail: false },
    { key: 'opus', label: 'Opus', ext: 'opus', audioFormat: 'opus', embedThumbnail: false },
    { key: 'wav', label: 'WAV', ext: 'wav', audioFormat: 'wav', embedThumbnail: false },
  ],
} as const;

export type VideoEncodingKey = (typeof encodingConfig.video)[number]['key'];
export type AudioEncodingKey = (typeof encodingConfig.audio)[number]['key'];
```

- [ ] **Create logger.ts** — write the logger utility.
- [ ] **Create deferred.ts** — write the Deferred class.
- [ ] **Create encoding-config.ts** — write the encoding config with all video/audio options.
- [ ] **Verify build** — `npx tsc --noEmit` passes.

