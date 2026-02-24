# Global Detection Threshold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a backend-global `detection_threshold` that gates alert triggering while renaming current `threshold` semantics to `noise_threshold` (sensor command threshold), and render pairing ellipses with 3 states: neutral (below noise / no qualifying detection), yellow (between noise and detection), red (at/above detection with active alert).

**Architecture:** Keep `noise_threshold` as device-facing config (`threshold <value>` serial command + `CMD:CONFIG threshold:<n>` telemetry). Add a separate backend runtime config `detection_threshold` in `SensorState.config`. Detection events are always logged; only events with `value >= detection_threshold` trigger alarm state + `crossing_alert`. Enforce `detection_threshold >= noise_threshold` when both are known. On the frontend map, compute each pairing ellipse state from current alert + latest detection telemetry for that pair: red for active alert, yellow for non-alert detections where `noise_threshold <= value < detection_threshold`, neutral otherwise. Yellow is transient and expires 10 seconds after the qualifying detection timestamp unless refreshed by a newer qualifying detection.

**Tech Stack:** FastAPI + WebSocket backend (Python), React + TypeScript frontend, pytest, vitest, Playwright, Bun.

---

### Task 1: Model/config contract for dual thresholds

**Files:**
- Modify: `backend/core/models.py`
- Modify: `frontend/src/domain/monitor/model/types.ts`
- Modify: `frontend/src/domain/monitor/model/monitorState.ts`
- Test: `backend/test/core/test_service.py`

**Step 1: Write failing backend snapshot/config shape test**

Add a failing assertion in `backend/test/core/test_service.py::test_snapshot_includes_command_map_defaults`:
- Expect `current["config"]` to include both `noise_threshold` and `detection_threshold` keys (plus existing `gain`).

**Step 2: Run test to verify it fails**

Run: `bun run test:backend -- backend/test/core/test_service.py -k snapshot_includes_command_map_defaults -v`
Expected: FAIL because config only has `{"gain": None}`.

**Step 3: Implement minimal backend config shape**

In `backend/core/models.py`:
- Extend `SensorConfig` to include:
  - `noise_threshold: int | None`
  - `detection_threshold: int | None`
  - `gain: int | None`
- Initialize defaults in `SensorState.__init__`.

**Step 4: Align frontend type contract**

In `frontend/src/domain/monitor/model/types.ts` and `monitorState.ts`:
- Extend `MonitorConfig` and initial state/default parsing assumptions to include new fields.

**Step 5: Re-run targeted tests**

Run:
- `bun run test:backend -- backend/test/core/test_service.py -k snapshot_includes_command_map_defaults -v`
- `bun run test:frontend -- frontend/src/domain/monitor/model/monitorState.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add backend/core/models.py backend/test/core/test_service.py frontend/src/domain/monitor/model/types.ts frontend/src/domain/monitor/model/monitorState.ts
git commit -m "feat: add noise and detection thresholds to config model"
```

### Task 2: Backend command/API path for detection threshold

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/test/api/test_routes.py`

**Step 1: Write failing websocket command test**

In `backend/test/api/test_routes.py::test_websocket_routes_command_messages`:
- Send `{"cmd":"set_detection_threshold","value":700}`.
- Expect command handling to update backend state config (no serial write).
- Keep existing `set_threshold` path sending serial `threshold <value>`.

**Step 2: Run test to verify it fails**

Run: `bun run test:backend -- backend/test/api/test_routes.py -k websocket_routes_command_messages -v`
Expected: FAIL because command is unsupported.

**Step 3: Implement minimal command handling**

In `backend/api/routes.py`:
- Add a handler branch for `set_detection_threshold`:
  - validate integer input
  - validate against known `noise_threshold` (`value >= noise_threshold`)
  - on success update `deps.state.config["detection_threshold"]`
  - enqueue broadcaster snapshot
- Keep `_build_serial_command` mapping for `set_threshold` => `threshold <value>`.

**Step 4: Re-run targeted test**

Run: `bun run test:backend -- backend/test/api/test_routes.py -k websocket_routes_command_messages -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/api/routes.py backend/test/api/test_routes.py
git commit -m "feat: add websocket command for detection threshold"
```

### Task 3: Rename existing threshold semantics to noise threshold in backend service

**Files:**
- Modify: `backend/core/service.py`
- Modify: `backend/test/core/test_service.py`

**Step 1: Write failing config-event test**

Add/update test in `backend/test/core/test_service.py`:
- For `{"type":"config","threshold":777,"value":799,...}`
- Expect `state.config["noise_threshold"] == 777` and `state.config["gain"] == 799`.

**Step 2: Run test to verify it fails**

Run: `bun run test:backend -- backend/test/core/test_service.py -k handle_config_event_updates_config_values -v`
Expected: FAIL because threshold is not persisted.

**Step 3: Implement minimal rename mapping**

In `backend/core/service.py` config-event branch:
- Set `state.config["noise_threshold"] = event["threshold"]`.
- Preserve gain behavior.

**Step 4: Re-run targeted test**

Run: `bun run test:backend -- backend/test/core/test_service.py -k handle_config_event_updates_config_values -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/core/service.py backend/test/core/test_service.py
git commit -m "refactor: map device threshold to noise threshold"
```

### Task 4: Detection handling gate (log-only vs alert)

**Files:**
- Modify: `backend/core/service.py`
- Modify: `backend/test/core/test_service.py`

**Step 1: Write failing tests for 3-state behavior**

Add tests:
1. `value < detection_threshold` but valid detection event:
- expect detection log entry exists
- expect `alarm_state` unchanged (or not set to `alarm`)
- expect `crossing_alert is None`
2. `value >= detection_threshold`:
- expect current alarm + crossing alert behavior.
3. Validation test for threshold invariant:
- when both known, attempts to set detection below noise are rejected at command layer (assert via route tests if better scoped there).

**Step 2: Run failing tests**

Run: `bun run test:backend -- backend/test/core/test_service.py -k detection -v`
Expected: FAIL for non-alert detection case.

**Step 3: Implement minimal gate logic**

In `backend/core/service.py` detection branch:
- Always update sensor link status and log detection.
- Compute `should_trigger_alert`:
  - if `detection_threshold` is `None`: preserve current behavior (alert) for backward compatibility
  - else alert only when `event["value"] >= detection_threshold`
- Only when true: set alarm, detection time, and crossing alert.

**Step 4: Re-run targeted tests**

Run: `bun run test:backend -- backend/test/core/test_service.py -k detection -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/core/service.py backend/test/core/test_service.py
git commit -m "feat: gate alerts by detection threshold while always logging detections"
```

### Task 5: Frontend settings/UI rename and new control

**Files:**
- Modify: `frontend/src/domain/monitor/ui/ConfigMenu.tsx`
- Modify: `frontend/src/domain/monitor/ui/ConfigMenu.test.tsx`
- Modify: `frontend/src/domain/monitor/service/monitorSocket.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/App.test.tsx`
- Modify: `frontend/src/domain/monitor/service/monitorSocket.test.tsx`

**Step 1: Write failing frontend tests**

Add/update tests for:
- Label rename: `Threshold` -> `Noise Threshold`.
- New input/button: `Detection Threshold` with dedicated send callback.
- `sendDetectionThreshold` emits websocket payload `{ cmd: 'set_detection_threshold', value }`.
- UI validation: if both thresholds known in UI state, prevent sending detection below noise and show disabled send (or inline validation).

**Step 2: Run failing tests**

Run:
- `bun run test:frontend -- frontend/src/domain/monitor/ui/ConfigMenu.test.tsx`
- `bun run test:frontend -- frontend/src/domain/monitor/service/monitorSocket.test.tsx`
- `bun run test:frontend -- frontend/src/app/App.test.tsx`
Expected: FAIL due to missing control and callback.

**Step 3: Implement minimal UI/wiring**

- In `ConfigMenu.tsx`:
  - Rename existing threshold field to `Noise Threshold`.
  - Add `Detection Threshold` field + send button.
  - Add client-side guard `detection >= noise` when both parse as numbers.
- In `useMonitorSocket`:
  - Add `sendDetectionThreshold` callback sending new command.
- In `App.tsx` and prop flows:
  - pass new callback into `ConfigMenu`.

**Step 4: Re-run targeted frontend tests**

Run same commands from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/domain/monitor/ui/ConfigMenu.tsx frontend/src/domain/monitor/ui/ConfigMenu.test.tsx frontend/src/domain/monitor/service/monitorSocket.ts frontend/src/domain/monitor/service/monitorSocket.test.tsx frontend/src/app/App.tsx frontend/src/app/App.test.tsx
git commit -m "feat: add detection threshold control and rename noise threshold UI"
```

### Task 6: Pairing ellipse color states (neutral/yellow/red)

**Files:**
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.test.tsx`
- Optional (if extracted): `frontend/src/domain/monitor/model/monitorState.ts`

**Step 1: Write failing map color-state tests**

Add/update tests for:
- Red when pair has active unacknowledged `crossingAlert`.
- Yellow when latest detection for that pair is between thresholds (`noise_threshold <= value < detection_threshold`) and no active alert.
- Yellow expires after 10 seconds since that detection (use controlled time in test).
- Neutral when no qualifying detection for that pair.

Use explicit expectations:
- red: `#ef4444`
- yellow: `#eab308`
- neutral: existing neutral color (`#67e8f9` unless design token changes).

**Step 2: Run failing tests**

Run: `bun run test:frontend -- frontend/src/domain/monitor/ui/MonitorMap.test.tsx`
Expected: FAIL because yellow state does not exist yet.

**Step 3: Implement minimal ellipse state derivation**

In `MonitorMap.tsx`:
- Derive pair key status with precedence: `alert > between-threshold > neutral`.
- Apply a strict 10-second yellow window (e.g., `BETWEEN_THRESHOLD_WINDOW_MS = 10_000`).
- Use state/config data already in props (or add minimal new props for thresholds/events if needed via `App.tsx`).
- Keep rendering limited to enabled pairings.

**Step 4: Re-run targeted tests**

Run: `bun run test:frontend -- frontend/src/domain/monitor/ui/MonitorMap.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/domain/monitor/ui/MonitorMap.tsx frontend/src/domain/monitor/ui/MonitorMap.test.tsx frontend/src/app/App.tsx frontend/src/app/App.test.tsx frontend/src/domain/monitor/model/types.ts frontend/src/domain/monitor/model/monitorState.ts
git commit -m "feat: add neutral yellow red pairing ellipse states"
```
### Task 7: End-to-end verification and regression checks

**Files:**
- Modify (if needed): `frontend/src/domain/monitor/ui/EventLog.tsx` (only if text/fields require clarity)
- Optional test additions near existing domain tests

**Step 1: Add integration-level regression tests if gaps remain**

- Backend route test: invalid `set_detection_threshold` below known noise threshold is rejected and does not mutate state.
- Backend service test: non-alert detection still appears in event log.

**Step 2: Run full verification required by repo policy**

Run:
- `bun run lint`
- `bun run test`

Expected: both PASS.

**Step 3: Playwright flow verification**

Run: `bun run demo`
Then verify manually in browser:
- Set noise threshold via settings (serial command path).
- Set detection threshold >= noise threshold.
- Confirm between-threshold detection appears in Event Log only.
- Confirm above-detection event creates alert banner/alarm behavior.

**Step 4: Commit final polish (if any)**

```bash
git add <any-final-touched-files>
git commit -m "test: cover threshold validation and dual-threshold alert behavior"
```

### Task 8: Documentation update

**Files:**
- Modify: `doc/plan/*` (or project README/config docs location)

**Step 1: Add concise behavior contract docs**

Document exact semantics:
- `noise_threshold`: device threshold, below it no detection event is generated.
- `detection_threshold`: backend alert threshold.
- `noise <= detection` invariant.
- Between thresholds => log only, no alert.
- At/above detection => alert.

**Step 2: Verify docs and commit**

```bash
git add doc/plan/<updated-doc>.md
git commit -m "docs: document dual-threshold detection and alert semantics"
```
