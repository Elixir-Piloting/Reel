### Task 4.2: Startup queue cleanup

**Files:**
- Modify: `src-tauri/src/lib.rs` — in `setup`/`load_saved_queue`, mark in-flight items as failed

In `load_saved_queue`, iterate persisted queue items. Any item with status `"Downloading"` or `"Queued"` should be marked as `Failed("App was closed")`.

- [ ] **Implement startup cleanup** — mark orphaned items as failed.
- [ ] **Verify `cargo check`** passes.

