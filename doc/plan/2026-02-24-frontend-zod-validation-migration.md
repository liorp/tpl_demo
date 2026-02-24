# Frontend Zod Validation Migration (Option 2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual frontend validation at input/runtime boundaries and monitor model normalization paths with Zod schemas while preserving current behavior.

**Architecture:** Introduce a centralized schema layer under `frontend/src/domain/monitor/model/validation.ts` and a small runtime config schema in `frontend/src/config.ts`. Keep existing domain APIs stable by parsing unknown data through Zod and transforming to current app types. Migrate incrementally with TDD so behavior remains unchanged and parsing edge-cases stay covered.

**Tech Stack:** React 19, TypeScript, Vitest, Biome, Zod

---

### Task 1: Add Zod Dependency

**Files:**
- Modify: `frontend/package.json`
- Modify: `bun.lock`

**Step 1: Add dependency declaration**
- Add `"zod": "^3.x"` to `frontend/package.json` dependencies.

**Step 2: Install and refresh lockfile**
Run: `cd frontend && bun add zod`
Expected: dependency installed and lockfile updated.

**Step 3: Sanity check type graph**
Run: `cd frontend && bun run typecheck`
Expected: PASS.

**Step 4: Commit**
Run:
```bash
git add frontend/package.json bun.lock
git commit -m "chore(frontend): add zod for runtime validation"
```

### Task 2: Migrate Runtime Port Validation in `config.ts`

**Files:**
- Modify: `frontend/src/config.ts`
- Modify: `frontend/src/config.test.ts`

**Step 1: Write failing tests for schema-driven behavior**
- Add tests covering:
  - numeric integer in range accepted
  - numeric string in range accepted after trim
  - floats, empty strings, non-numeric strings, and out-of-range values rejected to default
- Keep expected behavior aligned with current API (`resolveBackendPort`).

**Step 2: Run targeted test to verify failure**
Run: `cd frontend && bun run test -- src/config.test.ts`
Expected: FAIL for new cases before implementation.

**Step 3: Implement minimal Zod schema in `config.ts`**
- Replace `toValidPort` manual checks with a Zod schema + transform/refine pipeline.
- Keep exported function signatures unchanged.

**Step 4: Re-run targeted tests**
Run: `cd frontend && bun run test -- src/config.test.ts`
Expected: PASS.

**Step 5: Commit**
Run:
```bash
git add frontend/src/config.ts frontend/src/config.test.ts
git commit -m "refactor(frontend): use zod for backend port parsing"
```

### Task 3: Introduce Monitor Validation Schemas

**Files:**
- Create: `frontend/src/domain/monitor/model/validation.ts`
- Modify: `frontend/src/domain/monitor/model/types.ts` (only if type exports are needed)
- Test: `frontend/src/domain/monitor/model/monitorState.test.ts`

**Step 1: Add failing tests for monitor payload normalization edge cases**
- Add tests for current behavior of:
  - crossing alert parsing with snake_case / camelCase fields
  - map policy defaults for invalid structures
  - payload units filtering invalid entries
  - sensor status peer filtering
- Use existing expectations from current manual guard behavior.

**Step 2: Run targeted monitor model tests to verify failures**
Run: `cd frontend && bun run test -- src/domain/monitor/model/monitorState.test.ts`
Expected: FAIL for new tests before schema integration.

**Step 3: Implement schema module**
- Build Zod schemas for:
  - crossing alert raw payload
  - map bounds / map policy
  - sensor status payload map
  - unit payload list
  - websocket monitor payload minimum envelope
- Include helper functions returning parsed/safe defaults (e.g., `parseMapPolicy`, `parsePayloadUnits`, `isMonitorPayload` replacement).

**Step 4: Re-run targeted tests**
Run: `cd frontend && bun run test -- src/domain/monitor/model/monitorState.test.ts`
Expected: PASS.

**Step 5: Commit**
Run:
```bash
git add frontend/src/domain/monitor/model/validation.ts frontend/src/domain/monitor/model/monitorState.test.ts frontend/src/domain/monitor/model/types.ts
git commit -m "refactor(frontend): add zod monitor payload schemas"
```

### Task 4: Replace Manual Validation in `monitorState.ts`

**Files:**
- Modify: `frontend/src/domain/monitor/model/monitorState.ts`
- Test: `frontend/src/domain/monitor/model/monitorState.test.ts`

**Step 1: Write failing tests if any behavior changes appear during wiring**
- Add regression tests only for deltas uncovered while integrating schema helpers.

**Step 2: Run targeted test to verify failure**
Run: `cd frontend && bun run test -- src/domain/monitor/model/monitorState.test.ts`
Expected: FAIL for added regressions.

**Step 3: Wire schema helpers into monitorState**
- Replace manual guards in:
  - `toCrossingAlert`
  - `toMapBounds` / `toMapPolicy`
  - `toSensorStatusMap`
  - `toPayloadUnits`
- Keep external function signatures and return semantics unchanged.

**Step 4: Re-run targeted tests**
Run: `cd frontend && bun run test -- src/domain/monitor/model/monitorState.test.ts`
Expected: PASS.

**Step 5: Commit**
Run:
```bash
git add frontend/src/domain/monitor/model/monitorState.ts frontend/src/domain/monitor/model/monitorState.test.ts
git commit -m "refactor(frontend): replace monitorState manual guards with zod"
```

### Task 5: Replace Manual Validation in Persistence Layer

**Files:**
- Modify: `frontend/src/domain/monitor/model/persistence.ts`
- Modify: `frontend/src/domain/monitor/model/persistence.test.ts`

**Step 1: Add failing tests for persistence parsing behavior**
- Add tests for:
  - invalid pair entries dropped
  - invalid global settings fallback to defaults
  - invalid units array handling remains backward-compatible

**Step 2: Run targeted tests to verify failure**
Run: `cd frontend && bun run test -- src/domain/monitor/model/persistence.test.ts`
Expected: FAIL for new cases.

**Step 3: Implement Zod-based parse for localStorage payload**
- Replace `normalizePairings` / `normalizeGlobalSettings` manual checks with schemas and transforms.
- Preserve output shape and current defaults.

**Step 4: Re-run targeted tests**
Run: `cd frontend && bun run test -- src/domain/monitor/model/persistence.test.ts`
Expected: PASS.

**Step 5: Commit**
Run:
```bash
git add frontend/src/domain/monitor/model/persistence.ts frontend/src/domain/monitor/model/persistence.test.ts
git commit -m "refactor(frontend): use zod for persisted monitor config parsing"
```

### Task 6: Replace WebSocket Payload Guard in `monitorSocket.ts`

**Files:**
- Modify: `frontend/src/domain/monitor/service/monitorSocket.ts`
- Modify: `frontend/src/domain/monitor/service/monitorSocket.test.tsx`

**Step 1: Add failing tests for payload guard behavior**
- Add tests ensuring malformed websocket messages are ignored.
- Add tests ensuring valid messages still flow to state updates.

**Step 2: Run targeted tests to verify failure**
Run: `cd frontend && bun run test -- src/domain/monitor/service/monitorSocket.test.tsx`
Expected: FAIL for newly added assertions.

**Step 3: Implement schema-based payload validation**
- Replace `isPayload` with Zod-based `safeParse` helper from `validation.ts`.
- Keep malformed message handling non-throwing.

**Step 4: Re-run targeted tests**
Run: `cd frontend && bun run test -- src/domain/monitor/service/monitorSocket.test.tsx`
Expected: PASS.

**Step 5: Commit**
Run:
```bash
git add frontend/src/domain/monitor/service/monitorSocket.ts frontend/src/domain/monitor/service/monitorSocket.test.tsx
git commit -m "refactor(frontend): validate websocket payloads with zod"
```

### Task 7: Replace Manual Numeric Input Validation in `ConfigMenu.tsx`

**Files:**
- Modify: `frontend/src/domain/monitor/ui/ConfigMenu.tsx`
- Modify: `frontend/src/domain/monitor/ui/ConfigMenu.test.tsx`

**Step 1: Add failing UI tests**
- Add tests for:
  - Send disabled when threshold/gain input invalid
  - Send enabled for valid numeric values
  - Handler receives parsed number only when valid

**Step 2: Run targeted tests to verify failure**
Run: `cd frontend && bun run test -- src/domain/monitor/ui/ConfigMenu.test.tsx`
Expected: FAIL for new cases before wiring schemas.

**Step 3: Implement Zod parsing in component**
- Introduce reusable scalar numeric schema for threshold/gain.
- Replace `Number.isFinite`/trim checks with `safeParse` result.
- Keep user-facing behavior and toast messages unchanged.

**Step 4: Re-run targeted tests**
Run: `cd frontend && bun run test -- src/domain/monitor/ui/ConfigMenu.test.tsx`
Expected: PASS.

**Step 5: Commit**
Run:
```bash
git add frontend/src/domain/monitor/ui/ConfigMenu.tsx frontend/src/domain/monitor/ui/ConfigMenu.test.tsx
git commit -m "refactor(frontend): use zod for config menu input validation"
```

### Task 8: Full Verification and Cleanup

**Files:**
- Modify: any touched files as needed for lint/type/test stability

**Step 1: Run full frontend checks**
Run: `cd frontend && bun run lint && bun run typecheck && bun run test`
Expected: PASS.

**Step 2: Run repository-required checks**
Run: `bun run lint && bun run test`
Expected: PASS.

**Step 3: Run end-to-end verification requested by repo guidelines**
Run: `bun run demo`
Expected: frontend + backend + dummy device boot successfully; manually verify settings inputs, map/pairing flow, and websocket updates in browser.

**Step 4: Final commit (if needed)**
Run:
```bash
git add -A
git commit -m "refactor(frontend): migrate manual validation to zod"
```

**Step 5: Prepare handoff notes**
- Summarize all replaced manual validations and any intentionally retained non-validation logic.
- Include command outputs summary for `bun run lint`, `bun run test`, and demo verification notes.
