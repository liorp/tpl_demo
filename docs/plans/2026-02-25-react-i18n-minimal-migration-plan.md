# React I18n Minimal Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-grade internationalization to the React frontend with minimal architectural churn and no behavioral regressions.

**Architecture:** Use `i18next` + `react-i18next` with static in-bundle locale resources and browser language detection. Initialize i18n once in `main.tsx`, expose a tiny language switch entry in existing settings UI, and incrementally replace hardcoded UI strings with translation keys while preserving current component structure.

**Tech Stack:** React 19, TypeScript, Vitest, i18next, react-i18next, i18next-browser-languagedetector.

---

### Task 1: Add i18n dependencies and bootstrap files

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/i18n/config.ts`
- Create: `frontend/src/i18n/resources/en/common.json`
- Create: `frontend/src/i18n/resources/he/common.json`
- Modify: `frontend/src/main.tsx`

**Step 1: Write failing test for i18n bootstrap import**

```ts
// frontend/src/app/i18nBootstrap.test.ts
import '../i18n/config';
import i18n from 'i18next';

test('initializes i18n with common namespace', () => {
  expect(i18n.isInitialized).toBe(true);
  expect(i18n.hasResourceBundle('en', 'common')).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test -- i18nBootstrap.test.ts`
Expected: FAIL (module/resource not found).

**Step 3: Add minimal implementation**
- Add dependencies: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
- Create i18n config with:
  - `fallbackLng: 'en'`
  - `supportedLngs: ['en', 'he']`
  - `defaultNS: 'common'`
  - `interpolation.escapeValue: false`
  - Browser detection order: localStorage, navigator.
- Import `./i18n/config` at top of `main.tsx`.

**Step 4: Run test to verify it passes**

Run: `cd frontend && bun run test -- i18nBootstrap.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/package.json frontend/src/main.tsx frontend/src/i18n/
git commit -m "feat(frontend): bootstrap i18next with en/he resources"
```

### Task 2: Add typed translation key helper and language preference persistence

**Files:**
- Create: `frontend/src/i18n/keys.ts`
- Create: `frontend/src/i18n/useLanguage.ts`
- Test: `frontend/src/i18n/useLanguage.test.ts`

**Step 1: Write failing tests for language switching**

```ts
import { renderHook, act } from '@testing-library/react';
import { useLanguage } from './useLanguage';

test('changes language and persists preference', async () => {
  const { result } = renderHook(() => useLanguage());
  await act(async () => {
    await result.current.setLanguage('he');
  });
  expect(result.current.language).toBe('he');
  expect(localStorage.getItem('i18nextLng')).toBe('he');
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test -- src/i18n/useLanguage.test.ts`
Expected: FAIL (hook missing).

**Step 3: Implement minimal hook**
- `useLanguage` wraps `useTranslation`/`i18n.language` and `i18n.changeLanguage`.
- Keep API tiny: `{ language, setLanguage, supportedLanguages }`.
- `keys.ts` exports typed key strings for high-frequency strings to reduce key typos.

**Step 4: Run test to verify it passes**

Run: `cd frontend && bun run test -- src/i18n/useLanguage.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/i18n/useLanguage.ts frontend/src/i18n/useLanguage.test.ts frontend/src/i18n/keys.ts
git commit -m "feat(frontend): add language switch hook with persistence"
```

### Task 3: Integrate language selector with minimal UI change

**Files:**
- Modify: `frontend/src/domain/monitor/ui/ConfigMenu.tsx`
- Modify: `frontend/src/domain/monitor/ui/ConfigMenu.test.tsx`
- Modify: `frontend/src/i18n/resources/en/common.json`
- Modify: `frontend/src/i18n/resources/he/common.json`

**Step 1: Write failing test for language control visibility and behavior**

```ts
test('allows selecting language from settings', async () => {
  // open settings, select Hebrew, assert translated label appears
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test -- src/domain/monitor/ui/ConfigMenu.test.tsx`
Expected: FAIL (control absent).

**Step 3: Implement minimal UI addition**
- Add compact language selector row inside existing Settings dialog (reuse existing visual patterns).
- No new route/context/provider.
- Add translations for selector label/options only.

**Step 4: Run tests to verify pass**

Run: `cd frontend && bun run test -- src/domain/monitor/ui/ConfigMenu.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/domain/monitor/ui/ConfigMenu.tsx frontend/src/domain/monitor/ui/ConfigMenu.test.tsx frontend/src/i18n/resources/
git commit -m "feat(frontend): add language selector to settings"
```

### Task 4: Migrate high-visibility static strings first

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/domain/monitor/ui/StatusStrip.tsx`
- Modify: `frontend/src/domain/monitor/ui/ConnectionIndicator.tsx`
- Modify: `frontend/src/domain/monitor/ui/CrossingAlertBanner.tsx`
- Modify: `frontend/src/domain/monitor/ui/PairingPanel.tsx`
- Modify: `frontend/src/domain/monitor/ui/EventLog.tsx`
- Modify: `frontend/src/component/ErrorBoundary.tsx`
- Modify: corresponding `*.test.tsx`
- Modify: `frontend/src/i18n/resources/en/common.json`
- Modify: `frontend/src/i18n/resources/he/common.json`

**Step 1: Write failing tests for translated text rendering**
- Update/extend existing tests to assert key labels render via i18n (default English remains unchanged).
- Add one explicit Hebrew rendering assertion for smoke coverage.

**Step 2: Run targeted tests to verify failures**

Run:
- `cd frontend && bun run test -- src/app/App.test.tsx`
- `cd frontend && bun run test -- src/domain/monitor/ui/StatusStrip.test.tsx`
- `cd frontend && bun run test -- src/domain/monitor/ui/ConnectionIndicator.test.tsx`

Expected: FAIL where hardcoded strings still used.

**Step 3: Implement incremental text migration**
- Replace literal UI strings with `t('...')`.
- Preserve dynamic formatting with interpolation values (`{{port}}`, `{{sensorA}}`, etc.).
- Keep protocol/event payload strings untouched (only user-facing UI text changes).
- Keep ARIA labels translated and deterministic for tests.

**Step 4: Run targeted tests to verify pass**

Run same targeted test commands from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/app/App.tsx frontend/src/domain/monitor/ui frontend/src/component/ErrorBoundary.tsx frontend/src/i18n/resources frontend/src/app/App.test.tsx
git commit -m "refactor(frontend): translate primary monitor UI strings"
```

### Task 5: Handle date/time and numeric localization where it is user-facing

**Files:**
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.test.tsx`
- Modify: locale resources

**Step 1: Write failing test for localized relative time fallback formatting**

```ts
test('uses localized last heartbeat label text', () => {
  // assert label is translated while relative time still renders safely
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test -- src/domain/monitor/ui/MonitorMap.test.tsx`
Expected: FAIL.

**Step 3: Implement minimal localization**
- Keep `dayjs` usage; localize surrounding label text via i18n.
- Do not introduce extra date library.
- Optionally map `dayjs.locale(currentLanguage)` only if needed for `fromNow()`.

**Step 4: Run test to verify pass**

Run: `cd frontend && bun run test -- src/domain/monitor/ui/MonitorMap.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/domain/monitor/ui/MonitorMap.test.tsx frontend/src/i18n/resources
git commit -m "refactor(frontend): localize map popup labels"
```

### Task 6: Verification and regression safety

**Files:**
- Modify (if needed): tests updated in prior tasks.
- Optionally create: `docs/plans/2026-02-25-react-i18n-verification-notes.md`

**Step 1: Run full lint and tests**

Run:
- `bun run lint`
- `bun run test`

Expected: PASS.

**Step 2: Run end-to-end smoke via demo with Playwright**

Run:
- `bun run demo`
- Validate in Playwright:
  - Open settings and switch EN/HE.
  - Verify top status strip, map refresh button, settings labels, alerts/actions, and footer connection text switch languages.
  - Verify no runtime errors and websocket behavior unchanged.

Expected: pass manual E2E checks.

**Step 3: Add i18n guardrails (non-blocking but recommended)**
- Add simple script/test that compares key sets between `en/common.json` and `he/common.json`.
- Fail CI if keys diverge.

**Step 4: Final commit**

```bash
git add -A
git commit -m "test(frontend): add i18n verification and key parity guard"
```

## Recommended approach (minimal change)
1. Start with `react-i18next` in-place migration, no app-wide context rewrite.
2. Keep translation resources local JSON files and bundle them with app build.
3. Translate only user-facing UI text first; avoid touching backend payload semantics.
4. Migrate component-by-component using existing test files as safety net.
5. Add language selector to existing `ConfigMenu` only, not a new settings system.

## Out of scope (for this iteration)
- Server-driven translation catalogs.
- Dynamic lazy-loading namespaces.
- Full RTL layout support beyond language text swap.
- Translating raw serial event payload contents.
