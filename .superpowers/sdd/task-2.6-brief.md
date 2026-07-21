### Task 2.6: Remove old `download-store.ts` and update imports

**Files:**
- Delete: `src/stores/download-store.ts`
- Modify: all component files to import from new stores

- [ ] **Delete `download-store.ts`** — remove the god store.
- [ ] **Update imports** across all components to use the new focused stores.
- [ ] **Verify build** — `npx tsc --noEmit` passes with no missing exports.

---

## Phase 3: Architecture Reorganization

Move code into feature-based folder structure following the target layout from megaprompt §13.

