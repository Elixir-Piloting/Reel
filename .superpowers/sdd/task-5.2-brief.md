### Task 5.2: Fix paste/analyze race condition

**Files:**
- Modify: `src/features/url-input/UrlInput.tsx`

Change `analyzeUrl` to accept an optional URL parameter. On paste, pass URL directly:

```typescript
const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      setUrl(text);
      await analyzeUrl(text); // Pass URL directly
    }
  } catch { logger.warn('Clipboard read failed'); }
};
```

- [ ] **Update `analyzeUrl` in analysis-store** to accept optional URL param.
- [ ] **Update `UrlInput.tsx`** to pass URL directly, removing `setTimeout` hack.
- [ ] **Verify** paste works without the 50ms timeout.

