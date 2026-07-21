# Phase 4: Rust Backend Cleanup — Report

**Status:** ✅ Complete

## Tasks

### 4.1 AppError enum
- Created `src-tauri/src/error.rs` with `AppError` enum (7 variants, `thiserror` + `serde`)
- Added `thiserror = "2"` to `Cargo.toml`
- Added `mod error;` to `lib.rs`

### 4.2 Startup queue cleanup
- Modified `load_saved_queue` in `src-tauri/src/commands/download.rs`
- After deserializing saved items, any with status `Queued` or `Downloading` are set to `Failed("App was closed")`

### 4.3 Structured logging
- Created `src-tauri/src/logging.rs` — zero external dependencies (uses `std::sync::OnceLock`)
- Provides `log_info()` and `log_error()` — writes to both `app_data_dir/logs/ytmate.log` and stderr
- Added `mod logging;` to `lib.rs`
- Replaced all `eprintln!` calls in `download.rs` (42 call sites) with `crate::logging::log_info` / `log_error`
- Only intentional `eprintln!` calls remaining are the fallback prints inside `logging.rs` itself

## Build
- `cargo check` passes cleanly (only pre-existing dead-code warnings for `AppError`, `init`, etc.)
- No new dependencies for logging (`OnceLock` is std-only)

## Commit
```
ffcddf2 feat: add AppError enum, startup queue cleanup, structured logging
```
