# Command Map Full Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a full offline command-map workflow with unit placement, pairing control, config editing, signal/link status visualization, and persistent crossing alerts.

**Architecture:** Keep backend as telemetry/command bridge and frontend as operator state authority for map placement/pairings/config. Extend websocket payload with structured runtime fields while preserving current event log behavior. Persist UI-owned state in browser storage with schema versioning.

**Tech Stack:** FastAPI, Python parser/service pipeline, React + TypeScript, react-leaflet, vitest, pytest, Bun/uv.

---

### Task 1: Add backend models for command-map runtime data

**Files:**
- Modify: `backend/core/models.py`
- Test: `backend/test/core/test_service.py`

**Step 1: Write failing tests for snapshot shape extensions**
- Add assertions that `snapshot()` includes empty defaults for:
  - `links` (active runtime links)
  - `crossing_alert` (nullable)
  - `config` (`threshold`, `val`)
- Add a test that existing fields (`connected`, `port`, `alarm`, `events`) remain present.

**Step 2: Run targeted test to verify failure**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -v`
- Expected: FAIL for missing keys in snapshot.

**Step 3: Implement minimal model changes**
- Extend `SensorState` with runtime data containers for:
  - active link quality/intensity by pair
  - current crossing alert payload
  - latest config values (`threshold`, `val`)
- Update `snapshot(state)` to emit these fields with stable JSON-safe types.

**Step 4: Run tests to verify pass**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -v`
- Expected: PASS.

**Step 5: Commit**
- Run:
```bash
git add backend/core/models.py backend/test/core/test_service.py
git commit -m "feat(backend): extend snapshot with command-map runtime fields"
```

### Task 2: Parse and handle richer serial events for signal/crossing/config

**Files:**
- Modify: `backend/parsing/parser.py`
- Modify: `backend/core/service.py`
- Modify: `backend/core/models.py`
- Test: `backend/test/parsing/test_parser.py`
- Test: `backend/test/core/test_service.py`

**Step 1: Write failing parser tests**
- Add fixtures/lines for:
  - crossing/detection payload with IDs + value/threshold/count
  - map/status payload containing signal quality/intensity per link (or best-available current fields)
  - config response line carrying threshold/val
- Assert parsed dictionaries contain normalized numeric fields.

**Step 2: Run parser tests to confirm failure**
- Run: `uv run --project backend pytest backend/test/parsing/test_parser.py -v`
- Expected: FAIL on new cases returning `None` or missing fields.

**Step 3: Implement parser additions**
- Add regexes and parse branches for new line patterns observed from device logs.
- Keep parser permissive: ignore unknown lines and preserve old behavior.

**Step 4: Write failing service tests**
- Add tests verifying `handle_event()` updates:
  - active link matrix for signal updates
  - `crossing_alert` payload for detection/crossing
  - config state on config response
- Keep existing alarm/log tests intact.

**Step 5: Implement service reducer updates**
- Update `handle_event()` branches for new event types.
- Ensure log lines stay human-readable and backwards compatible.

**Step 6: Run backend test subset**
- Run:
```bash
uv run --project backend pytest backend/test/parsing/test_parser.py backend/test/core/test_service.py -v
```
- Expected: PASS.

**Step 7: Commit**
- Run:
```bash
git add backend/parsing/parser.py backend/core/service.py backend/core/models.py backend/test/parsing/test_parser.py backend/test/core/test_service.py
git commit -m "feat(backend): parse and reduce command-map signal and crossing events"
```

### Task 3: Add websocket command handling for config and map requests

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/main.py`
- Modify: `backend/serial/manager.py`
- Test: `backend/test/core/test_service.py` (or new `backend/test/api/test_routes.py`)

**Step 1: Write failing tests for ws command routing**
- Test that websocket text/JSON commands route to serial send:
  - `ack` (existing)
  - `set_threshold`
  - `set_val`
  - `map`
- Assert invalid command is ignored without crash.

**Step 2: Run tests to confirm failure**
- Run: `uv run --project backend pytest backend/test -k "routes or service" -v`
- Expected: FAIL for missing command handling.

**Step 3: Implement minimal command router**
- Add helper to parse received websocket message:
  - accept legacy plain `ack`
  - accept JSON command object for config/map actions
- Route supported commands to `SerialManager.send_serial(...)` using current CLI command format.

**Step 4: Verify tests pass**
- Run: `uv run --project backend pytest backend/test -k "routes or service" -v`
- Expected: PASS.

**Step 5: Commit**
- Run:
```bash
git add backend/api/routes.py backend/main.py backend/serial/manager.py backend/test
git commit -m "feat(backend): support websocket config and map commands"
```

### Task 4: Expand frontend monitor types, reducers, and persistence

**Files:**
- Modify: `frontend/src/domain/monitor/model/types.ts`
- Modify: `frontend/src/domain/monitor/model/monitorState.ts`
- Modify: `frontend/src/domain/monitor/model/monitorState.test.ts`
- Create: `frontend/src/domain/monitor/model/persistence.ts`
- Create: `frontend/src/domain/monitor/model/persistence.test.ts`

**Step 1: Write failing reducer tests**
- Add tests for:
  - placing/moving unit by ID
  - enforcing max 32 units
  - pairing add/remove validation
  - signal stale timeout selector
  - crossing alert acknowledge flow

**Step 2: Run frontend model tests to confirm failure**
- Run: `cd frontend && bun run test -- monitorState`
- Expected: FAIL for missing reducers/selectors.

**Step 3: Implement types + reducers**
- Add explicit types:
  - `UnitPlacement`, `PairLink`, `SignalLinkState`, `CrossingAlert`, `ConfigState`
- Add pure reducer helpers and selectors in `monitorState.ts`.

**Step 4: Add local persistence module**
- Implement `loadPersistedMonitorConfig()` and `savePersistedMonitorConfig()`.
- Include `schemaVersion` and safe fallback on parse/version errors.

**Step 5: Add persistence tests and run test subset**
- Run:
```bash
cd frontend && bun run test -- monitorState persistence
```
- Expected: PASS.

**Step 6: Commit**
- Run:
```bash
git add frontend/src/domain/monitor/model/types.ts frontend/src/domain/monitor/model/monitorState.ts frontend/src/domain/monitor/model/monitorState.test.ts frontend/src/domain/monitor/model/persistence.ts frontend/src/domain/monitor/model/persistence.test.ts
git commit -m "feat(frontend): add command-map domain state and persistence"
```

### Task 5: Upgrade websocket client to process richer payload and commands

**Files:**
- Modify: `frontend/src/domain/monitor/service/monitorSocket.ts`
- Modify: `frontend/src/domain/monitor/model/types.ts`
- Test: `frontend/src/domain/monitor/model/monitorState.test.ts`

**Step 1: Write failing tests (or integration-level model tests) for payload mapping**
- Validate mapping from backend payload fields into expanded monitor state.
- Validate command send helpers for `ack`, `set_threshold`, `set_val`, `map`.

**Step 2: Run tests and confirm failure**
- Run: `cd frontend && bun run test -- monitorState`
- Expected: FAIL due to missing mappers/helpers.

**Step 3: Implement websocket protocol upgrade**
- Accept structured payload fields with runtime link/alert/config data.
- Export typed actions from hook:
  - `acknowledge()`
  - `requestMap()`
  - `applyConfig({ threshold, val })`

**Step 4: Re-run targeted tests**
- Run: `cd frontend && bun run test -- monitorState`
- Expected: PASS.

**Step 5: Commit**
- Run:
```bash
git add frontend/src/domain/monitor/service/monitorSocket.ts frontend/src/domain/monitor/model/types.ts frontend/src/domain/monitor/model/monitorState.test.ts
git commit -m "feat(frontend): extend monitor websocket protocol and command actions"
```

### Task 6: Implement offline bounded map with unit placement interactions

**Files:**
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Create: `frontend/src/domain/monitor/ui/UnitMarker.tsx`
- Create: `frontend/src/domain/monitor/ui/MapBounds.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/style/globals.css`

**Step 1: Write failing UI tests for placement behavior**
- Add tests (vitest + RTL) for:
  - entering placement mode
  - clicking map places/moves selected unit
  - bounds rejection outside Israel+10km

**Step 2: Run targeted tests to confirm failure**
- Run: `cd frontend && bun run test -- MonitorMap`
- Expected: FAIL for missing UI controls/handlers.

**Step 3: Implement map features**
- Replace online OSM tile URL with bundled tile URL path.
- Apply max bounds covering Israel + 10 km margin.
- Render unit markers and pairing polylines.
- Add placement-mode interaction and marker popover details.

**Step 4: Re-run tests + build check**
- Run:
```bash
cd frontend && bun run test -- MonitorMap
cd frontend && bun run build
```
- Expected: PASS.

**Step 5: Commit**
- Run:
```bash
git add frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/domain/monitor/ui/UnitMarker.tsx frontend/src/domain/monitor/ui/MapBounds.ts frontend/src/app/App.tsx frontend/src/style/globals.css
git commit -m "feat(frontend): add offline bounded map and unit placement"
```

### Task 7: Add pairing control and CMD status overlays

**Files:**
- Create: `frontend/src/domain/monitor/ui/PairingPanel.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Modify: `frontend/src/app/App.tsx`
- Test: `frontend/src/domain/monitor/model/monitorState.test.ts`

**Step 1: Write failing tests for pairing reducers and display derivations**
- Validate add/remove/toggle pairing behaviors.
- Validate link style derivation from signal quality/intensity + stale timeout.

**Step 2: Run tests to confirm failure**
- Run: `cd frontend && bun run test -- monitorState`
- Expected: FAIL.

**Step 3: Implement pairing panel + overlays**
- Add UI for editing pair links among placed units.
- Render directional link lines with style encoding for quality/intensity.
- Show active/inactive state from signal freshness.

**Step 4: Run tests and lint**
- Run:
```bash
cd frontend && bun run test -- monitorState
cd frontend && bun run lint
```
- Expected: PASS.

**Step 5: Commit**
- Run:
```bash
git add frontend/src/domain/monitor/ui/PairingPanel.tsx frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/app/App.tsx frontend/src/domain/monitor/model/monitorState.test.ts
git commit -m "feat(frontend): add pairing control and command link status overlays"
```

### Task 8: Add configuration menu for threshold/val

**Files:**
- Create: `frontend/src/domain/monitor/ui/ConfigMenu.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/domain/monitor/service/monitorSocket.ts`
- Modify: `frontend/src/domain/monitor/model/monitorState.ts`
- Test: `frontend/src/domain/monitor/model/monitorState.test.ts`

**Step 1: Write failing tests for config validation and apply flow**
- Validate numeric constraints and invalid input handling.
- Validate apply action emits websocket command only for valid payload.

**Step 2: Run targeted tests to confirm failure**
- Run: `cd frontend && bun run test -- monitorState`
- Expected: FAIL.

**Step 3: Implement config menu UI + apply behavior**
- Add modal/drawer showing current `threshold` and `val`.
- Add explicit Apply/Cancel behavior and validation messages.
- Wire `applyConfig` command through socket hook.

**Step 4: Run tests and lint**
- Run:
```bash
cd frontend && bun run test -- monitorState
cd frontend && bun run lint
```
- Expected: PASS.

**Step 5: Commit**
- Run:
```bash
git add frontend/src/domain/monitor/ui/ConfigMenu.tsx frontend/src/app/App.tsx frontend/src/domain/monitor/service/monitorSocket.ts frontend/src/domain/monitor/model/monitorState.ts frontend/src/domain/monitor/model/monitorState.test.ts
git commit -m "feat(frontend): add configuration menu for threshold and val"
```

### Task 9: Add persistent crossing alert UI and map focus

**Files:**
- Create: `frontend/src/domain/monitor/ui/CrossingAlertBanner.tsx`
- Modify: `frontend/src/domain/monitor/ui/StatusStrip.tsx`
- Modify: `frontend/src/domain/monitor/ui/EventLog.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Modify: `frontend/src/app/App.tsx`
- Test: `frontend/src/domain/monitor/model/monitorState.test.ts`

**Step 1: Write failing tests for persistent alert behavior**
- Assert crossing alert remains visible until explicit acknowledge.
- Assert event log lines include sensor IDs and location context when available.

**Step 2: Run tests to confirm failure**
- Run: `cd frontend && bun run test -- monitorState EventLog`
- Expected: FAIL.

**Step 3: Implement alert components and focus flow**
- Add persistent banner displaying sensor A/B IDs and timestamp.
- Add “Focus on map” action to center map on crossing location.
- Keep `ack` semantics aligned with backend acknowledge behavior.

**Step 4: Re-run tests + lint**
- Run:
```bash
cd frontend && bun run test -- monitorState EventLog
cd frontend && bun run lint
```
- Expected: PASS.

**Step 5: Commit**
- Run:
```bash
git add frontend/src/domain/monitor/ui/CrossingAlertBanner.tsx frontend/src/domain/monitor/ui/StatusStrip.tsx frontend/src/domain/monitor/ui/EventLog.tsx frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/app/App.tsx frontend/src/domain/monitor/model/monitorState.test.ts
git commit -m "feat(frontend): add persistent crossing alert banner and map focus"
```

### Task 10: Add tile-pack integration and offline asset checks

**Files:**
- Create/Modify: `frontend/public/tiles/` (tile pack files or manifest pointer)
- Modify: `backend/api/routes.py` (if static mount path adjustments required)
- Create: `doc/plan/tiles/README.md` (asset update procedure)

**Step 1: Add failing runtime check/test for tile availability**
- Add lightweight guard test or startup assertion for configured tile root.
- Expected failure when tile root is absent.

**Step 2: Implement tile manifest and fallback UI state**
- Add manifest JSON in frontend static assets and runtime presence check.
- Show explicit map asset error state if not found.

**Step 3: Validate build and runtime load path**
- Run:
```bash
bun run build
bun run dev
```
- Expected: map loads tiles from `/asset/...` without internet.

**Step 4: Commit**
- Run:
```bash
git add frontend/public/tiles backend/api/routes.py doc/plan/tiles/README.md
git commit -m "chore(frontend): integrate bundled offline tile pack and checks"
```

### Task 11: End-to-end verification (automated + hardware)

**Files:**
- Modify if needed: tests touched in prior tasks
- Create: `doc/plan/2026-02-16-command-map-full-verification-notes.md`

**Step 1: Run full lint/tests**
- Run:
```bash
bun run lint
bun run test
```
- Expected: all PASS.

**Step 2: Hardware integration run with connected unit**
- Run backend with forced serial port:
```bash
SERIAL_PORT=/dev/cu.usbserial-0001 bun run dev:backend
```
- In separate shell run frontend:
```bash
bun run dev:frontend
```
- Validate:
  - connection indicator shows connected on `/dev/cu.usbserial-0001`
  - live events continue in tracker
  - map placement works offline
  - pairing and config commands emit
  - crossing alert shows two sensor IDs + location and persists until acknowledge

**Step 3: Optional fallback check**
- If `cu` path fails on this machine, retry with:
```bash
SERIAL_PORT=/dev/tty.usbserial-0001 bun run dev:backend
```

**Step 4: Record verification evidence**
- Save command outputs and observed behavior in verification notes document.

**Step 5: Commit**
- Run:
```bash
git add doc/plan/2026-02-16-command-map-full-verification-notes.md
git commit -m "test: record command-map verification including hardware serial run"
```

### Task 12: Final review and branch readiness

**Files:**
- No code changes required unless fixes found.

**Step 1: Request code review pass**
- Review diff for regressions in existing monitor behavior.

**Step 2: If review issues found, apply focused fixes with tests first**
- Add missing tests before behavior changes.

**Step 3: Final sanity run**
- Run:
```bash
bun run lint
bun run test
```

**Step 4: Prepare merge summary**
- Summarize delivered features and known limitations.

