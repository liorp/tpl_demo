# Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 10 issues from the senior architect code review: stale ref, god object split, typed events, module boundary violation, route-layer domain logic extraction, global re-render fix, domain logic extraction from App.tsx, CI/CD, TypeScript type-checking, and duplicate constants.

**Architecture:** Backend refactors split `SensorState` into a clean domain model (no serial/threading deps) with serial lifecycle managed by `SerialManager`. Events become a discriminated union of concrete TypedDicts. Frontend refactors extract domain logic from App.tsx into the model layer and narrow component props. CI added via GitHub Actions.

**Tech Stack:** Python/FastAPI, React/TypeScript, GitHub Actions, Vitest, Pytest, Biome, Ruff

---

### Task 1: Remove stale `crossingAckWindows` from composed MonitorState

The `crossingAckWindowsRef.current` in the `useMemo` is captured once and never triggers recomputation. The field exists in `MonitorState` type but is only consumed by `isCrossingAlertSuppressed` inside the `onmessage` handler, which reads the ref directly. The composed state's `crossingAckWindows` is vestigial.

**Files:**
- Modify: `frontend/src/domain/monitor/service/monitorSocket.ts:326-336`
- Modify: `frontend/src/domain/monitor/model/types.ts:116-131`
- Modify: `frontend/src/domain/monitor/model/monitorState.ts:193-201` (createInitialMonitorState)

**Step 1: Remove `crossingAckWindows` from `MonitorState` type**

In `frontend/src/domain/monitor/model/types.ts`, remove line 124 (`crossingAckWindows: CrossingAckWindow[];`) from the `MonitorState` type.

**Step 2: Remove `crossingAckWindows` from `createInitialMonitorState`**

In `frontend/src/domain/monitor/model/monitorState.ts`, remove `crossingAckWindows: [],` from `createInitialMonitorState()`.

**Step 3: Remove `crossingAckWindows` from composed state in `useMonitorSocket`**

In `frontend/src/domain/monitor/service/monitorSocket.ts`, remove the `crossingAckWindows: crossingAckWindowsRef.current,` line from the `useMemo` composing `MonitorState`.

**Step 4: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All tests pass. If any test references `crossingAckWindows` on `MonitorState`, update those tests too.

**Step 5: Run lint**

Run: `cd frontend && bun run lint`
Expected: PASS

---

### Task 2: Split `SensorState` — extract serial connection into `SerialManager`

`SensorState` in `core/models.py` mixes domain state with serial hardware resources (`serial_conn`, `serial_lock`). Move serial connection lifecycle into `SerialManager` so `core/models.py` has no `import serial` or `import threading`.

**Files:**
- Modify: `backend/core/models.py`
- Modify: `backend/serial/manager.py`
- Modify: `backend/core/service.py` (remove `mark_disconnected` serial close logic — Task 4)
- Modify: `backend/main.py`
- Modify: `backend/test/core/test_service.py`
- Modify: `backend/test/serial/test_manager.py`
- Modify: `backend/test/api/test_routes.py`

**Step 1: Move serial connection state to `SerialManager`**

In `backend/serial/manager.py`, add `serial_conn`, `serial_lock`, and `send_serial` as proper attributes of `SerialManager.__init__` instead of reaching into `SensorState`:

```python
class SerialManager:
    def __init__(self, forced_port: str):
        self.forced_port = forced_port
        self._serial_lock = threading.Lock()
        self._serial_conn: serial.Serial | None = None

    def send_serial(self, cmd: str):
        with self._serial_lock:
            if self._serial_conn and self._serial_conn.is_open:
                self._serial_conn.write((cmd + "\r").encode())

    def close_connection(self):
        """Close the serial connection. Thread-safe."""
        with self._serial_lock:
            if self._serial_conn:
                with contextlib.suppress(Exception):
                    self._serial_conn.close()
                self._serial_conn = None
```

Update `_connect` to use `self._serial_lock` and `self._serial_conn` instead of `self.state.serial_lock` / `self.state.serial_conn`.

Remove `state` parameter from `__init__`. Remove `self.state` references. The `add_log` calls in the reader loop should be replaced by emitting log messages via the `MessageSink` — but that's a larger change. For now, simply remove the `self.state.add_log` calls from `serial_reader_loop` (these are debug messages like "Trying port: X" that aren't critical).

**Step 2: Clean up `SensorState`**

In `backend/core/models.py`:
- Remove `import serial` and `import threading`
- Remove `self.serial_conn`, `self.serial_lock`, `self._log_lock` attributes
- Add a simple lock for log thread safety using a different approach: since `add_log` is called from async context (after the sync-to-async bridge), we can use a simple list operation. However, `add_log` IS still called from `serial_reader_loop` (sync thread) indirectly via `service.handle_event` → `state.add_log`. Keep a threading lock but import threading only for that:

Actually, looking more carefully: `add_log` is called from:
1. `service.py` functions which are called from `_serial_consumer` (async, on event loop thread)
2. `serial_manager.serial_reader_loop` directly via `self.state.add_log` — which we're removing in Step 1

So after removing the serial manager's direct `state.add_log` calls, ALL mutations to `SensorState` happen on the event loop thread. The `_log_lock` is no longer needed. Remove `threading` import entirely.

Final `SensorState`:
```python
class SensorState:
    def __init__(self):
        self.serial_connected = False
        self.current_port = "None"
        self.alarm_state = "disconnected"
        self.last_detection_time = 0.0
        self.logs: list[dict] = []
        self.max_logs = 50
        self.links: list[dict] = []
        self.crossing_alert: dict | None = None
        self.config = {"threshold": None, "val": None}
        self.units: list[dict] = []
        self.sensor_status: dict = {}
        self.map_policy: MapPolicy = dict(DEFAULT_MAP_POLICY)

    def add_log(self, message: str):
        entry = {"time": datetime.now().strftime("%H:%M:%S"), "msg": message}
        self.logs.insert(0, entry)
        if len(self.logs) > self.max_logs:
            self.logs.pop()
```

**Step 3: Update `main.py`**

- Change `SerialManager(state=state, forced_port=SERIAL_PORT)` to `SerialManager(forced_port=SERIAL_PORT)`
- In `_serial_consumer`, when handling `SerialDisconnect`, call `serial_manager.close_connection()` then `mark_disconnected(state, msg.reason)` (the updated `mark_disconnected` from Task 4 won't touch serial).

**Step 4: Update tests**

- `test_routes.py`: `SensorState()` no longer has `serial_lock`/`serial_conn`. No changes needed since `FakeBroadcaster` doesn't use them.
- `test_service.py`: `SensorState()` no longer has serial attributes. Existing tests should pass since they don't test serial closing. The `mark_disconnected` test changes happen in Task 4.
- `test_manager.py`: Update to create `SerialManager(forced_port=...)` without `state`.

**Step 5: Run all backend tests**

Run: `uv run --project backend pytest -v`
Expected: All pass

---

### Task 3: Type the event system — discriminated union of concrete TypedDicts

Replace the single `Event(TypedDict, total=False)` with concrete types per event, providing type safety between parser and service.

**Files:**
- Modify: `backend/core/models.py`
- Modify: `backend/parsing/parser.py`
- Modify: `backend/core/service.py`
- Modify: `backend/core/events.py`
- Modify: `backend/test/core/test_service.py`

**Step 1: Define concrete event types in `core/models.py`**

Replace the single `Event` class with:

```python
class DetectionEvent(TypedDict):
    type: Literal["detection"]
    id_a: str
    unit_a: int
    id_b: str
    unit_b: int
    threshold: int
    value: int
    count: int
    device_ts: int


class CommLossEvent(TypedDict):
    type: Literal["comm_loss"]
    id_a: str
    unit_a: int
    id_b: str
    unit_b: int
    value: int
    device_ts: int


class ConnectedEvent(TypedDict):
    type: Literal["connected"]
    id_unit: str
    unit: int
    id_peer: str
    peer: int
    connected: bool
    device_ts: int


class MapEvent(TypedDict):
    type: Literal["map"]
    unit_id: int
    version: str
    gain: int
    voltage: int
    links: list[dict[str, int]]
    device_ts: int


class ConfigEvent(TypedDict):
    type: Literal["config"]
    threshold: int
    value: int
    device_ts: int


Event = DetectionEvent | CommLossEvent | ConnectedEvent | MapEvent | ConfigEvent
```

Add `from typing import Literal` import.

**Step 2: Update parser return types**

In `backend/parsing/parser.py`, change return type from `dict[str, Any] | None` to `Event | None` and import the union type.

```python
from backend.core.models import Event
```

The actual dicts returned already match the shapes. No code changes needed in the parser body.

**Step 3: Update service.py**

In `handle_event`, the `event["type"]` access stays the same, but mypy/pyright can now narrow types after the `if etype == "detection":` checks. No runtime changes needed — this is purely a type-safety improvement.

Remove the dead parameter from `_event_last_seen`:

```python
def _event_last_seen() -> int:
    return int(now_ts())
```

Update call sites: `_event_last_seen(event)` → `_event_last_seen()`.

**Step 4: Update `events.py`**

`SerialEvent.event` type changes from the old `Event` to the new union `Event`. Import stays the same since the name hasn't changed.

**Step 5: Update tests**

Test dicts in `test_service.py` already match the concrete shapes. No changes needed unless the type checker complains about literal `"type"` values — the existing test dicts will type-check correctly against the union.

**Step 6: Run tests**

Run: `uv run --project backend pytest -v`
Expected: All pass

---

### Task 4: Fix module boundary — remove serial close from `core/service.py`

`mark_disconnected` in `service.py` reaches into `state.serial_conn` via `state.serial_lock` to close the serial connection. After Task 2, `SensorState` no longer has these fields. Update `mark_disconnected` to only handle domain state.

**Files:**
- Modify: `backend/core/service.py`
- Modify: `backend/main.py`

**Step 1: Simplify `mark_disconnected`**

```python
def mark_disconnected(state: SensorState, reason: str | None = None) -> bool:
    set_connection_state(state, False, "None", "disconnected")
    if reason:
        state.add_log(reason)
    return True
```

Remove the `import contextlib` since it's no longer needed.

**Step 2: Update `main.py` serial consumer**

In `_serial_consumer`, the `SerialDisconnect` branch should close the serial connection via the manager before updating domain state:

```python
elif isinstance(msg, SerialDisconnect):
    serial_manager.close_connection()
    mark_disconnected(state, msg.reason)
    broadcaster.enqueue(snapshot(state))
```

**Step 3: Update architecture test**

In `backend/test/architecture/test_import_boundaries.py`, add a test verifying `core/service.py` does not import from `serial`:

```python
def test_service_does_not_import_serial_module():
    service_file = Path("backend/core/service.py")
    content = service_file.read_text()
    assert "import serial" not in content
    assert "import contextlib" not in content  # was only used for serial close
```

**Step 4: Run tests**

Run: `uv run --project backend pytest -v`
Expected: All pass

---

### Task 5: Extract `_set_unit_position` domain logic to service layer

Move the validation, mutation, and persistence logic from the route handler into `core/service.py`. The route handler becomes a thin dispatcher.

**Files:**
- Modify: `backend/core/service.py`
- Modify: `backend/api/routes.py`
- Modify: `backend/test/api/test_routes.py` (existing tests continue to work)

**Step 1: Create `set_unit_position` in `core/service.py`**

Move the validation and mutation logic. The function receives the parsed payload fields and the state/persistence dependencies:

```python
def set_unit_position(
    state: SensorState,
    unit_id: int,
    lat: float,
    lng: float,
    save_fn: Callable,
    layout_path: str | Path,
) -> bool:
    if unit_id < 0:
        return False
    next_lat = float(lat)
    next_lng = float(lng)
    if not math.isfinite(next_lat) or not math.isfinite(next_lng):
        return False
    bounds = state.map_policy.get("bounds")
    if not isinstance(bounds, dict) or not _within_bounds(next_lat, next_lng, bounds):
        return False

    updated = False
    for unit in state.units:
        if unit.get("id") == unit_id:
            unit["lat"] = next_lat
            unit["lng"] = next_lng
            if "label" not in unit:
                unit["label"] = f"S{unit_id}"
            updated = True
            break
    if not updated:
        state.units.append({"id": unit_id, "label": f"S{unit_id}", "lat": next_lat, "lng": next_lng})

    persisted = save_fn(layout_path, {"units": list(state.units), "map_policy": dict(state.map_policy)})
    state.units = persisted["units"]
    state.map_policy = persisted["map_policy"]
    return True
```

Also move `_within_bounds` from `routes.py` to `service.py`.

**Step 2: Thin out the route handler**

```python
def _handle_unit_position(deps: AppDeps, payload: dict[str, Any]) -> bool:
    if payload.get("cmd") != "set_unit_position":
        return False
    unit_id = payload.get("unit_id")
    lat = payload.get("lat")
    lng = payload.get("lng")
    if (
        not isinstance(unit_id, int)
        or not isinstance(lat, (float, int))
        or not isinstance(lng, (float, int))
    ):
        return False
    changed = set_unit_position(
        deps.state, unit_id, lat, lng, deps.save_layout, deps.layout_state_path,
    )
    if changed:
        deps.broadcaster.enqueue(snapshot(deps.state))
    return changed
```

Import `set_unit_position` from `backend.core.service`.

**Step 3: Run tests**

Run: `uv run --project backend pytest -v`
Expected: All pass — the route tests exercise the same code path, just factored differently.

---

### Task 6: Fix 1-second global re-render

The `nowSeconds` state in `App.tsx` updates every second, causing the entire tree to re-render. `nowSeconds` is only used by `activeUnits` to filter stale sensors. Move the staleness computation to a dedicated hook or directly into the `activeUnits` memo so it doesn't force a root re-render.

**Files:**
- Modify: `frontend/src/app/App.tsx`

**Step 1: Move the timer into a `useActiveUnits` function**

Replace the `nowSeconds` state + `activeUnits` memo with a single `useMemo` + `useState` that is scoped to just the unit filtering. Actually, the simplest fix: just compute `nowSeconds` inside the `activeUnits` memo callback instead of as separate state. But `useMemo` won't re-run without a dependency change...

Better approach: Create a custom hook that encapsulates the timer and returns only `activeUnits`. This isolates the re-render to just the hook consumer — but since App.tsx IS the consumer, it still re-renders App.

The real fix: Use `React.memo` on child components that don't depend on `activeUnits`, OR move the timer + filtering into a separate component that only wraps the parts that need it.

Simplest effective fix: Wrap the expensive children in `React.memo`. But that's many files.

Most pragmatic fix: Extract a `<MonitorLayout>` component that receives stable props, and keep `nowSeconds` + `activeUnits` in `App`. The children that DON'T depend on `activeUnits` (EventLog, ConfigMenu, ConnectionIndicator, StatusStrip, CrossingAlertBanner) get stable references and won't re-render IF they're memoized.

Actually, the simplest and most effective approach: keep the timer but reduce its scope. `activeUnits` is the only consumer. Move `nowSeconds` computation to `useSyncExternalStore` with a 1-second snapshot, or better yet: just compute `Date.now()` inside `useMemo` and add a `tick` state that only updates when the filtered result actually changes:

Simplest correct approach: **Replace `setInterval` + `useState` with `useSyncExternalStore`** for `nowSeconds`. This is equivalent but signals to React that it's an external store, enabling better optimization. But it doesn't actually reduce re-renders.

**Most pragmatic approach:** Compute staleness inside `activeUnits` memo with a `tick` counter that increments every second, BUT memoize child components with `React.memo` so only the components that receive `activeUnits` re-render. However, that touches many files.

**Actual simplest approach that works:** Replace the 1-second timer with a coarser 5-second timer. Staleness after 60 seconds doesn't need 1-second precision. This is a one-line change that reduces re-renders 5x.

Let's go with: change interval from 1000ms to 5000ms, and memoize `StatusStrip` and `ConnectionIndicator` with `React.memo` (they get the full state but don't depend on `nowSeconds`).

Actually, re-reading: `StatusStrip` and `ConnectionIndicator` both receive `state` as a prop. `state` is a new object every render because of the `useMemo` in `useMonitorSocket`. So `React.memo` won't help without also narrowing their props (Task 7/8 from review).

**Final approach:** Narrow the props for `StatusStrip` and `ConnectionIndicator` (fix #17 from review) AND change interval to 5s. This is clean and effective.

**In `App.tsx`:**

Change `1000` to `5_000` in the `setInterval` call. The staleness threshold is 60 seconds — 5-second precision is more than adequate.

**Step 2: Narrow `StatusStrip` props** (fix #17)

Change `StatusStrip` to accept only the fields it reads:

```tsx
type Props = {
  alarm: AlarmState;
  serverOnline: boolean;
};
```

Update `App.tsx` to pass `<StatusStrip alarm={state.alarm} serverOnline={state.serverOnline} />`.

Wrap export with `React.memo`.

**Step 3: Narrow `ConnectionIndicator` props**

Change `ConnectionIndicator` to accept only the fields it reads:

```tsx
type Props = {
  connected: boolean;
  serverOnline: boolean;
  port: string;
};
```

Update `App.tsx` to pass `<ConnectionIndicator connected={state.connected} serverOnline={state.serverOnline} port={state.port} />`.

Wrap export with `React.memo`.

**Step 4: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All pass

**Step 5: Run lint**

Run: `cd frontend && bun run lint`
Expected: PASS

---

### Task 7: Extract domain logic from App.tsx to model layer

`toLeafletBounds`, `toUnixSeconds`, and `selectedSensorLinks` computation are pure domain functions living in the app shell. Move them to the model layer.

**Files:**
- Create: `frontend/src/domain/monitor/model/mapViewport.ts` — already exists, add `toLeafletBounds` here
- Modify: `frontend/src/domain/monitor/model/monitorState.ts` — add `toUnixSeconds`, `getSelectedSensorLinks`
- Modify: `frontend/src/app/App.tsx`

**Step 1: Move `toLeafletBounds` to `mapViewport.ts`**

Read existing `mapViewport.ts` first. Add `toLeafletBounds` and `toUnixSeconds` there. These are pure geographic utility functions.

**Step 2: Move `selectedSensorLinks` computation**

Create `getSelectedSensorLinks` in `monitorState.ts`:

```typescript
export function getSelectedSensorLinks(
  selectedUnitId: number | null,
  sensorStatus: SensorStatusMap,
  links: SignalLinkState[],
): { peerId: number; direction: 'IN' | 'OUT'; quality: number | null; intensity: number | null }[] {
  // ... existing logic from App.tsx
}
```

**Step 3: Update App.tsx imports**

Replace inline definitions with imports. The `selectedSensorLinks` memo becomes:

```tsx
const selectedSensorLinks = useMemo(
  () => getSelectedSensorLinks(selectedUnitId, state.sensorStatus, state.links),
  [selectedUnitId, state.sensorStatus, state.links],
);
```

Remove `selectedSensorStatus` memo — fold it into `getSelectedSensorLinks`.

**Step 4: Run tests**

Run: `cd frontend && bun run test`
Expected: All pass

---

### Task 8: Deduplicate geographic constants

`DEFAULT_MAP_BOUNDS` in `App.tsx` and `ISRAEL_BOUNDS` in `MonitorMap.tsx` both represent Israel's bounding box with slightly different values (they're actually identical: `[29.2, 34.1], [33.55, 36.05]`).

**Files:**
- Modify: `frontend/src/domain/monitor/model/mapViewport.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/domain/monitor/ui/MonitorMap.tsx`

**Step 1: Add constant to `mapViewport.ts`**

```typescript
export const ISRAEL_MAP_BOUNDS: [[number, number], [number, number]] = [
  [29.2, 34.1],
  [33.55, 36.05],
];
```

**Step 2: Update `App.tsx`**

Replace `DEFAULT_MAP_BOUNDS` with `ISRAEL_MAP_BOUNDS` imported from `mapViewport.ts`.

**Step 3: Update `MonitorMap.tsx`**

Replace local `ISRAEL_BOUNDS` with `ISRAEL_MAP_BOUNDS` imported from `mapViewport.ts`.

**Step 4: Run tests and lint**

Run: `cd frontend && bun run test && bun run lint`
Expected: All pass

---

### Task 9: Add `tsc --noEmit` to lint pipeline

TypeScript strict mode is configured but nobody runs the type checker.

**Files:**
- Modify: `frontend/package.json`
- Modify: `/Users/liorpolak/projects/personal/tpl_demo/package.json` (root)

**Step 1: Add typecheck script to frontend package.json**

```json
"typecheck": "tsc --noEmit"
```

**Step 2: Add to root lint command**

Update root `package.json` lint scripts:

```json
"lint:frontend": "cd frontend && bun run lint && bun run typecheck",
```

**Step 3: Run it**

Run: `bun run lint`
Expected: PASS (fix any type errors if they surface)

---

### Task 10: Add CI/CD via GitHub Actions

Add a minimal GitHub Actions workflow that runs tests and lint on push/PR.

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: astral-sh/setup-uv@v4
        with:
          python-version: "3.11"

      - name: Install frontend deps
        run: cd frontend && bun install --frozen-lockfile

      - name: Install backend deps
        run: cd backend && uv sync

      - name: Lint
        run: bun run lint

      - name: Typecheck
        run: cd frontend && bun run typecheck

      - name: Test frontend
        run: bun run test:frontend

      - name: Test backend
        run: bun run test:backend
```

**Step 2: Verify locally**

Run: `bun run lint && bun run test`
Expected: All pass

---

## Execution Order

Tasks have these dependencies:
- Task 2 (split SensorState) must complete before Task 4 (fix module boundary)
- Task 3 (typed events) and Task 2 are independent
- Task 4 depends on Task 2
- Task 5 (extract route logic) depends on Task 4 (since `_within_bounds` moves to service.py)
- Tasks 1, 6, 7, 8, 9, 10 are independent of each other and of backend tasks

**Recommended order:**
1. Task 1 (frontend, quick, independent)
2. Task 2 (backend, foundational)
3. Task 3 (backend, independent of Task 2 but best done after)
4. Task 4 (backend, depends on Task 2)
5. Task 5 (backend, depends on Task 4)
6. Task 6 (frontend, independent)
7. Task 7 (frontend, independent)
8. Task 8 (frontend, independent)
9. Task 9 (infra, independent)
10. Task 10 (infra, independent)

**Parallelizable groups:**
- Group A (frontend): Tasks 1, 6, 7, 8
- Group B (backend): Tasks 2 → 3 → 4 → 5 (sequential)
- Group C (infra): Tasks 9, 10
