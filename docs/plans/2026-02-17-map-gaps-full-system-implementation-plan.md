# Command Map Gaps Full-System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fully implement features `1,2,5,7`: true offline map (Israel + 10km), click-to-place unit icons, click-driven CMD status indicator, and crossing alert map location/focus.

**Architecture:** Move unit placement and map constraints to backend-owned state so all clients share one authoritative layout. Keep telemetry parsing in backend service and derive runtime sensor/link status there. Frontend consumes one websocket model, renders offline tiles, supports placement mode, and shows click-selected sensor/link status plus alert-driven map focus.

**Tech Stack:** FastAPI, Python service/parser modules, React + TypeScript, react-leaflet, vitest, pytest, Bun/uv.

---

### Task 1: Define backend contract for layout + runtime CMD status

**Files:**
- Modify: `backend/core/models.py`
- Test: `backend/test/core/test_service.py`

**Step 1: Write failing tests for new snapshot fields**
- Add assertions that `snapshot()` includes:
  - `units` (server-owned unit placement list)
  - `sensor_status` (per-sensor activity + last seen + connected peers)
  - `map_policy` (`bounds`, `buffer_km`, `tile_root`, `offline_required`)
- Keep existing field assertions (`links`, `crossing_alert`, `config`, etc.).

**Step 2: Run backend test and verify failure**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -v`
- Expected: FAIL for missing snapshot keys.

**Step 3: Implement minimal model changes**
- Extend `SensorState` with `units`, `sensor_status`, and `map_policy`.
- Emit deterministic JSON-safe defaults in `snapshot()`.

**Step 4: Run backend test and verify pass**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -v`
- Expected: PASS.

**Step 5: Commit**
```bash
git add backend/core/models.py backend/test/core/test_service.py
git commit -m "feat(backend): add snapshot contract for layout and cmd status"
```

### Task 2: Add backend persistence for unit placements and map policy

**Files:**
- Create: `backend/core/layout_store.py`
- Modify: `backend/main.py`
- Test: `backend/test/core/test_service.py`

**Step 1: Write failing tests for load/save behavior**
- Add tests for:
  - initial empty layout file
  - save and reload unit placements
  - rejecting invalid coordinates outside allowed bounds+buffer
- Include corruption fallback (invalid JSON -> safe defaults).

**Step 2: Run targeted tests and confirm failure**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -k "layout or units" -v`
- Expected: FAIL for missing store behavior.

**Step 3: Implement layout store**
- Add `load_layout_state()` and `save_layout_state()` with atomic write.
- Add bounds validator for Israel box plus 10km buffer policy.
- Load persisted units into `SensorState` at startup in `backend/main.py`.

**Step 4: Re-run tests**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -k "layout or units" -v`
- Expected: PASS.

**Step 5: Commit**
```bash
git add backend/core/layout_store.py backend/main.py backend/test/core/test_service.py
git commit -m "feat(backend): persist command-map unit layout and policy"
```

### Task 3: Add APIs/WebSocket commands for offline map and placement updates

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/main.py`
- Test: `backend/test/api/test_routes.py`
- Create/Modify: `frontend/public/tiles/` (offline tile pack root, manifest, and placeholders)
- Create: `doc/plan/tiles/README.md`

**Step 1: Write failing route tests**
- Add tests for:
  - `GET /api/map-policy` returns bounds, 10km buffer, tile root metadata
  - websocket `{"cmd":"set_unit_position","unit_id":X,"lat":Y,"lng":Z}` accepted/rejected by bounds
  - static tile root path serves local files under `/tiles/*`

**Step 2: Run route tests and confirm failure**
- Run: `uv run --project backend pytest backend/test/api/test_routes.py -v`
- Expected: FAIL for missing endpoints/command path.

**Step 3: Implement API + ws command handling**
- Add `/api/map-policy` endpoint.
- Add `/tiles` static mount (offline tile assets only).
- Extend `_build_serial_command` flow to separately process placement command (not forwarded to serial), update state, and persist via layout store.

**Step 4: Add tile-pack documentation and root structure**
- Add `frontend/public/tiles/manifest.json` and README process in `doc/plan/tiles/README.md`.
- Ensure production build keeps local tile assets available.

**Step 5: Re-run tests**
- Run: `uv run --project backend pytest backend/test/api/test_routes.py -v`
- Expected: PASS.

**Step 6: Commit**
```bash
git add backend/api/routes.py backend/main.py backend/test/api/test_routes.py frontend/public/tiles doc/plan/tiles/README.md
git commit -m "feat(backend): add offline map policy and unit placement command api"
```

### Task 4: Derive sensor activity graph and crossing alert coordinates in service layer

**Files:**
- Modify: `backend/core/service.py`
- Modify: `backend/core/models.py`
- Test: `backend/test/core/test_service.py`

**Step 1: Write failing service tests**
- Add tests asserting:
  - `connected` and `map` events update `sensor_status` activity/peers
  - `detection` events set `crossing_alert.lat/lng` from unit positions
  - unknown sensor IDs produce `lat/lng=None` without crash

**Step 2: Run service tests and confirm failure**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -k "sensor_status or crossing" -v`
- Expected: FAIL.

**Step 3: Implement reducer updates**
- Track `last_seen_at`, `active`, and peer quality summary per sensor from existing events.
- On detection, lookup both sensor coordinates and set crossing point (midpoint when both exist, fallback single-point when one exists).

**Step 4: Re-run service tests**
- Run: `uv run --project backend pytest backend/test/core/test_service.py -k "sensor_status or crossing" -v`
- Expected: PASS.

**Step 5: Commit**
```bash
git add backend/core/service.py backend/core/models.py backend/test/core/test_service.py
git commit -m "feat(backend): derive sensor activity graph and crossing coordinates"
```

### Task 5: Extend frontend model/socket protocol for server-owned units and cmd status

**Files:**
- Modify: `frontend/src/domain/monitor/model/types.ts`
- Modify: `frontend/src/domain/monitor/model/monitorState.ts`
- Modify: `frontend/src/domain/monitor/service/monitorSocket.ts`
- Test: `frontend/src/domain/monitor/model/monitorState.test.ts`
- Test: `frontend/src/domain/monitor/service/monitorSocket.test.tsx`

**Step 1: Write failing frontend tests**
- Add tests asserting:
  - payload mapping reads `units`, `sensor_status`, `map_policy`
  - `placeUnit` sends websocket placement command and updates optimistic UI
  - legacy payloads without new keys still parse safely

**Step 2: Run targeted frontend tests**
- Run: `cd frontend && bun run test -- monitorState monitorSocket`
- Expected: FAIL.

**Step 3: Implement protocol updates**
- Update types for new backend fields.
- Stop treating units as local-only persistence source of truth.
- Send `set_unit_position` command in `placeUnit` and apply rollback on reject/error message path.

**Step 4: Re-run frontend tests**
- Run: `cd frontend && bun run test -- monitorState monitorSocket`
- Expected: PASS.

**Step 5: Commit**
```bash
git add frontend/src/domain/monitor/model/types.ts frontend/src/domain/monitor/model/monitorState.ts frontend/src/domain/monitor/service/monitorSocket.ts frontend/src/domain/monitor/model/monitorState.test.ts frontend/src/domain/monitor/service/monitorSocket.test.tsx
git commit -m "feat(frontend): consume server layout and cmd status protocol"
```

### Task 6: Implement offline map rendering and click-to-place UX

**Files:**
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.test.tsx`
- Modify: `frontend/src/style/globals.css`

**Step 1: Write failing map UI tests**
- Add tests for:
  - tile layer points to local `/tiles/{z}/{x}/{y}.png`
  - map enforces Israel bounds + 10km buffer
  - clicking map in placement mode drops/updates a unit marker

**Step 2: Run map tests**
- Run: `cd frontend && bun run test -- MonitorMap`
- Expected: FAIL.

**Step 3: Implement map behavior**
- Add explicit placement mode (`idle`, `select-unit`, `drop-at-click`).
- Wire map click handler to call `placeUnit({ id, lat, lng })`.
- Keep marker popup for unit label/id and show coordinates.
- Ensure map remains usable offline with local tiles.

**Step 4: Re-run map tests**
- Run: `cd frontend && bun run test -- MonitorMap`
- Expected: PASS.

**Step 5: Commit**
```bash
git add frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/app/App.tsx frontend/src/domain/monitor/ui/MonitorMap.test.tsx frontend/src/style/globals.css
git commit -m "feat(frontend): add offline local tiles and click-to-place unit workflow"
```

### Task 7: Add click-driven CMD status indicator panel

**Files:**
- Create: `frontend/src/domain/monitor/ui/CommandStatusPanel.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Modify: `frontend/src/app/App.tsx`
- Test: `frontend/src/app/App.test.tsx`

**Step 1: Write failing app tests**
- Add tests that on unit click:
  - panel shows selected sensor active state
  - panel lists peer links with direction and `quality/intensity`
  - panel updates when selection changes

**Step 2: Run app tests and confirm failure**
- Run: `cd frontend && bun run test -- App`
- Expected: FAIL for missing panel/selection flow.

**Step 3: Implement panel + selection state**
- Lift selected sensor ID into `App`.
- Emit marker click events from `MonitorMap`.
- Render `CommandStatusPanel` with computed status from `sensor_status` + `links`.

**Step 4: Re-run app tests**
- Run: `cd frontend && bun run test -- App`
- Expected: PASS.

**Step 5: Commit**
```bash
git add frontend/src/domain/monitor/ui/CommandStatusPanel.tsx frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/app/App.tsx frontend/src/app/App.test.tsx
git commit -m "feat(frontend): add click-driven command status indicator panel"
```

### Task 8: Complete alert UI with IDs + location and map focus behavior

**Files:**
- Modify: `frontend/src/domain/monitor/ui/CrossingAlertBanner.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Test: `frontend/src/domain/monitor/ui/CrossingAlertBanner.test.tsx`

**Step 1: Write failing alert tests**
- Add tests asserting alert row includes:
  - sensor IDs
  - location text (`lat,lng` when available)
  - action that centers map on alert location

**Step 2: Run alert tests**
- Run: `cd frontend && bun run test -- CrossingAlertBanner`
- Expected: FAIL.

**Step 3: Implement alert focus flow**
- Extend banner to show formatted location if present.
- Add "Focus" action that sets `focusPoint` in `App`.
- Pass active alert focus point into `MonitorMap` and preserve acknowledge behavior.

**Step 4: Re-run alert tests**
- Run: `cd frontend && bun run test -- CrossingAlertBanner`
- Expected: PASS.

**Step 5: Commit**
```bash
git add frontend/src/domain/monitor/ui/CrossingAlertBanner.tsx frontend/src/app/App.tsx frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/domain/monitor/ui/CrossingAlertBanner.test.tsx
git commit -m "feat(frontend): show crossing coordinates and map focus actions"
```

### Task 9: Full verification and integration review

**Files:**
- Modify: `doc/plan/2026-02-17-map-gaps-full-system-verification-notes.md`

**Step 1: Run frontend lint**
- Run: `bun run lint`
- Expected: PASS.

**Step 2: Run full tests**
- Run: `bun run test`
- Expected: PASS for frontend and backend stacks.

**Step 3: Manual smoke verification checklist**
- Confirm:
  - map loads when internet is disabled (local tile pack present)
  - placement updates persist after reload and appear in second client
  - clicking sensor shows active/peer/quality panel
  - crossing alert shows IDs + location and focuses map

**Step 4: Save verification notes**
- Record command outputs and manual outcomes in `doc/plan/2026-02-17-map-gaps-full-system-verification-notes.md`.

**Step 5: Commit**
```bash
git add doc/plan/2026-02-17-map-gaps-full-system-verification-notes.md
git commit -m "docs: add verification evidence for command-map gap closure"
```
