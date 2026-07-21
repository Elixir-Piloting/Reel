# Task 2.6 Report: Remove old `download-store.ts` and update all imports

## Status
✅ Complete

## Commit
`22db670` - `refactor: delete old download-store, update all imports`

## Summary
- Deleted `src/stores/download-store.ts` (580 lines)
- Added `startPlaylistDownload` stub to `src/stores/download-execution-store.ts`
- Updated 12 files with new store imports and selectors

## Files changed
| File | Change |
|------|--------|
| `src/stores/download-store.ts` | **Deleted** |
| `src/stores/download-execution-store.ts` | +2 lines (stub interface + impl) |
| `src/App.tsx` | Import `useDownloadExecutionStore`; async initProgressListener cleanup |
| `src/pages/DownloadPage.tsx` | Split to 4 stores; `playlistItemProgress.length` → `Object.keys(itemProgress).length` |
| `src/components/download/DestinationSelector.tsx` | `useOptionsStore` + `useAnalysisStore`; `"audio-only"` → `"audio"` |
| `src/components/download/DownloadProgress.tsx` | `useDownloadExecutionStore` selectors |
| `src/components/download/DownloadTypeSelector.tsx` | `useOptionsStore`; values `video`/`audio` |
| `src/components/download/EncodingSelector.tsx` | `useOptionsStore`; `"audio-only"` → `"audio"` |
| `src/components/download/PlaylistSelector.tsx` | Split to 4 stores; `entry.index` → `idx+1`; `Set` → `Array` methods |
| `src/components/download/PresetSelector.tsx` | `usePresetStore` + `useOptionsStore`; `addPreset` 2-arg call |
| `src/components/download/QualitySelector.tsx` | `useAnalysisStore` + `useOptionsStore`; simplified label |
| `src/components/download/RangeSelector.tsx` | `useOptionsStore` + `useAnalysisStore` |
| `src/components/download/UrlInput.tsx` | `useAnalysisStore` selectors |
| `src/components/download/VideoInfo.tsx` | `useAnalysisStore` selectors |

## TypeScript issues encountered & fixed
1. **`initProgressListener` return type** — now async (`Promise<() => void>`), adjusted useEffect cleanup
2. **`DownloadType` string enum** — old `"audio-only" | "video+audio"` → new `"audio" | "video"`; updated all comparisons and `setDownloadType` calls
3. **`addPreset` signature** — now requires options as 2nd argument; wired from `useOptionsStore`
4. **`thumbnail_url` on `DownloadItem`** — new inline `DownloadItem` lacks `thumbnail_url`; used `unknown as Record` cast
5. **`q.fps` / `q.filesize`** — new `qualityOptions` is `{value, label}[]`; simplified UI label since metadata no longer available per-option
6. **`entry.index`** — new `PlaylistEntry` has `id` not `index`; uses `idx + 1` from array position
7. **`Set` → `Array`** — `selectedIndices` is now `number[]`; `has()` → `includes()`, `size` → `length`

## Report
`C:\dev\tauri\ytmate\.superpowers\sdd\task-2.6-report.md`
