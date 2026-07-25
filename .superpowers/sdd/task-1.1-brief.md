### Task 1.1: Fix logger to persist debug in production (#14.3)

**Files:**
- Modify: `src/shared/lib/logger.ts`

**Interfaces:**
- Consumes: none
- Produces: `logger.debug()` writes to file in production builds

- [ ] **Remove the production debug guard**

```typescript
// Remove this guard entirely:
// if (!isDev && level === 'debug') return;
```

- [ ] **Add file-backed debug logging**

```typescript
// Replace with:
function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  // Always write debug to the dev console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta) fn(`${prefix} ${msg}`, meta);
  else fn(`${prefix} ${msg}`);

  // Route to Tauri log command for production persistence
  if (!isDev && level === 'debug') {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('log_to_file', { level, message: `${prefix} ${msg}`, meta: meta ? JSON.stringify(meta) : '' });
    }).catch(() => {}); // best-effort
  }
}
```

- [ ] **Add Rust `log_to_file` command** in `src-tauri/src/logging.rs` (already exists — add a public `log_to_file` function that appends to the log file with timestamp)
- [ ] **Register command** in `src-tauri/src/lib.rs`: `.invoke_handler(tauri::generate_handler![log_to_file])`
- [ ] **Verify** debug logs appear in `app_data_dir/ytmate.log` in production
