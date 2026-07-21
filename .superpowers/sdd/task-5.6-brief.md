### Task 5.6: Zero-duration / live stream handling

**Files:**
- Modify: `src/features/download-options/RangeSelector.tsx`

Fix `pct()` to handle `maxTime === 0`:

```typescript
const pct = (v: number) => (maxTime > 0 ? (v / maxTime) * 100 : 0);
```

Hide the RangeSelector when `duration === 0` and show "Live stream — full duration will be downloaded".

- [ ] **Fix `pct()`** and add live stream guard.
- [ ] **Verify** no NaN values appear for zero-duration videos.

---

## Phase 6: Visual Design Overhaul

