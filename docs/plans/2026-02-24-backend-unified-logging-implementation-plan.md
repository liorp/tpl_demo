# Backend Unified Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a unified backend logging architecture that emits operational logs to `stdout` and a rotating log file while keeping frontend `events` behavior unchanged.

**Architecture:** Introduce a dedicated backend logging module responsible for logger setup, rotating file handler, and shared formatting. Keep domain event feed (`state.add_log`) as-is, but add helper functions that write both Python logs and UI event logs where needed. Wire configuration through `backend/config.py` and initialize once in `backend/main.py` to avoid duplicate handlers during reload.

**Tech Stack:** FastAPI, Python `logging`, `logging.handlers.RotatingFileHandler`, pytest.

---

### Task 1: Define logging configuration contract

**Files:**
- Modify: `backend/config.py`
- Test: `backend/test/core/test_logging_config.py` (new)

**Step 1: Write the failing test**

```python
from backend import config


def test_logging_defaults(monkeypatch):
    monkeypatch.delenv('APP_LOG_LEVEL', raising=False)
    monkeypatch.delenv('APP_LOG_FILE', raising=False)
    monkeypatch.delenv('APP_LOG_MAX_BYTES', raising=False)
    monkeypatch.delenv('APP_LOG_BACKUP_COUNT', raising=False)

    import importlib
    import backend.config as config_module
    importlib.reload(config_module)

    assert config_module.APP_LOG_LEVEL == 'INFO'
    assert config_module.APP_LOG_FILE.endswith('backend/data/app.log')
    assert config_module.APP_LOG_MAX_BYTES == 1_048_576
    assert config_module.APP_LOG_BACKUP_COUNT == 5
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest test/core/test_logging_config.py::test_logging_defaults -v`
Expected: FAIL with missing config constants.

**Step 3: Write minimal implementation**

Add to `backend/config.py`:

```python
APP_LOG_LEVEL = os.getenv('APP_LOG_LEVEL', 'INFO').strip().upper() or 'INFO'
APP_LOG_FILE = os.getenv('APP_LOG_FILE', '').strip() or str(
    (Path(__file__).resolve().parent / 'data' / 'app.log')
)
APP_LOG_MAX_BYTES = int(os.getenv('APP_LOG_MAX_BYTES', '1048576'))
APP_LOG_BACKUP_COUNT = int(os.getenv('APP_LOG_BACKUP_COUNT', '5'))
```

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest test/core/test_logging_config.py::test_logging_defaults -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/config.py backend/test/core/test_logging_config.py
git commit -m "Add backend logging configuration env defaults"
```

### Task 2: Build a unified logger setup module

**Files:**
- Create: `backend/core/logging_setup.py`
- Test: `backend/test/core/test_logging_setup.py` (new)

**Step 1: Write the failing test**

```python
import logging
from backend.core.logging_setup import configure_logging


def test_configure_logging_adds_stdout_and_rotating_file_handlers(tmp_path):
    log_file = tmp_path / 'app.log'

    logger = configure_logging(
        name='tpl-signum',
        level='INFO',
        log_file=str(log_file),
        max_bytes=1024,
        backup_count=2,
    )

    handler_types = {type(h).__name__ for h in logger.handlers}
    assert 'StreamHandler' in handler_types
    assert 'RotatingFileHandler' in handler_types
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest test/core/test_logging_setup.py::test_configure_logging_adds_stdout_and_rotating_file_handlers -v`
Expected: FAIL with missing module/function.

**Step 3: Write minimal implementation**

Implement `configure_logging(...)` that:
- creates/get logger by name,
- clears pre-existing handlers only for this logger,
- sets level,
- adds `StreamHandler`,
- creates parent directory for log file,
- adds `RotatingFileHandler(maxBytes=max_bytes, backupCount=backup_count)`,
- sets `propagate = False`.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest test/core/test_logging_setup.py::test_configure_logging_adds_stdout_and_rotating_file_handlers -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/core/logging_setup.py backend/test/core/test_logging_setup.py
git commit -m "Add unified logger bootstrap with stdout and rotating file handlers"
```

### Task 3: Make logger setup idempotent for reload-safe startup

**Files:**
- Modify: `backend/core/logging_setup.py`
- Test: `backend/test/core/test_logging_setup.py`

**Step 1: Write the failing test**

```python
def test_configure_logging_is_idempotent(tmp_path):
    log_file = tmp_path / 'app.log'

    logger1 = configure_logging('tpl-signum', 'INFO', str(log_file), 1024, 2)
    first_handler_count = len(logger1.handlers)

    logger2 = configure_logging('tpl-signum', 'INFO', str(log_file), 1024, 2)
    second_handler_count = len(logger2.handlers)

    assert logger1 is logger2
    assert second_handler_count == first_handler_count
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest test/core/test_logging_setup.py::test_configure_logging_is_idempotent -v`
Expected: FAIL due to duplicate handlers.

**Step 3: Write minimal implementation**

Update handler lifecycle logic so repeated setup does not accumulate handlers.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest test/core/test_logging_setup.py::test_configure_logging_is_idempotent -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/core/logging_setup.py backend/test/core/test_logging_setup.py
git commit -m "Make backend logging setup idempotent for reload"
```

### Task 4: Replace ad hoc logging bootstrap in app entrypoint

**Files:**
- Modify: `backend/main.py`
- Test: `backend/test/architecture/test_lifespan_events.py` (extend)

**Step 1: Write the failing test**

Add a test that patches `backend.main.configure_logging` and asserts it is called once with config values at module load or startup.

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest test/architecture/test_lifespan_events.py -k logging -v`
Expected: FAIL because `main.py` still uses `logging.basicConfig`.

**Step 3: Write minimal implementation**

In `backend/main.py`:
- remove `logging.basicConfig(...)`,
- import logging config constants from `backend.config`,
- call `configure_logging(...)`,
- keep `logger = logging.getLogger('tpl-signum')` for module usage.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest test/architecture/test_lifespan_events.py -k logging -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/main.py backend/test/architecture/test_lifespan_events.py
git commit -m "Wire main app startup to unified logger configuration"
```

### Task 5: Add an adapter for dual-write domain + operational logs

**Files:**
- Create: `backend/core/event_logging.py`
- Modify: `backend/core/service.py`
- Test: `backend/test/core/test_event_logging.py` (new)

**Step 1: Write the failing test**

```python
from backend.core.event_logging import log_event
from backend.core.models import SensorState


class DummyLogger:
    def __init__(self):
        self.messages = []

    def info(self, message, *args):
        self.messages.append(message % args if args else message)


def test_log_event_writes_to_state_and_logger():
    state = SensorState()
    logger = DummyLogger()

    log_event(state, logger, 'Alarm acknowledged')

    assert state.logs[0]['msg'] == 'Alarm acknowledged'
    assert logger.messages == ['Alarm acknowledged']
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest test/core/test_event_logging.py::test_log_event_writes_to_state_and_logger -v`
Expected: FAIL with missing module/function.

**Step 3: Write minimal implementation**

Add `log_event(state, logger, message, level='info')` that:
- calls `state.add_log(message)` (preserves frontend events),
- dispatches to logger method by level (`info` default),
- falls back to `info` for unknown levels.

Replace direct `state.add_log(...)` calls in `backend/core/service.py` with `log_event(...)`.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest test/core/test_event_logging.py::test_log_event_writes_to_state_and_logger -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/core/event_logging.py backend/core/service.py backend/test/core/test_event_logging.py
git commit -m "Add dual-write event logging adapter for service layer"
```

### Task 6: Apply dual-write logging in serial connection lifecycle

**Files:**
- Modify: `backend/main.py`
- Test: `backend/test/architecture/test_lifespan_events.py` (extend)

**Step 1: Write the failing test**

Add test coverage for `_serial_consumer` branches (`SerialConnected`, `SerialDisconnect`) to assert UI events still update and logger receives matching info/warn entries.

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest test/architecture/test_lifespan_events.py -k serial_consumer -v`
Expected: FAIL until dual-write behavior is implemented.

**Step 3: Write minimal implementation**

Update `_serial_consumer` handling in `main.py`:
- replace direct `state.add_log(...)` with `log_event(...)` for connection messages,
- log disconnect reasons at warning/info based on content,
- preserve broadcaster enqueue behavior exactly.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest test/architecture/test_lifespan_events.py -k serial_consumer -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/main.py backend/test/architecture/test_lifespan_events.py
git commit -m "Add unified lifecycle logging for serial connect and disconnect"
```

### Task 7: Add regression tests for unchanged frontend event feed shape

**Files:**
- Modify: `backend/test/core/test_service.py`
- Modify: `backend/test/api/test_routes.py`

**Step 1: Write the failing test**

Add assertions that snapshot and `/api/status` still return `events` as list of `{time, msg}` without new fields.

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest test/core/test_service.py test/api/test_routes.py -k events -v`
Expected: FAIL if accidental schema drift is introduced.

**Step 3: Write minimal implementation**

Only if needed, adjust adapter or serialization so schema remains unchanged.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest test/core/test_service.py test/api/test_routes.py -k events -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/test/core/test_service.py backend/test/api/test_routes.py
# include implementation files only if touched
git commit -m "Lock API event-feed schema while adding unified backend logging"
```

### Task 8: End-to-end verification and quality gates

**Files:**
- Modify: `doc/plan/2026-02-24-backend-unified-logging-implementation-plan.md` (append verification notes after execution)

**Step 1: Run backend test stack**

Run: `bun run test:backend`
Expected: PASS.

**Step 2: Run full required checks**

Run: `bun run test && bun run lint`
Expected: PASS for both commands.

**Step 3: Run UI behavior verification via Playwright flow**

Run: `bun run demo`
Expected: App starts, live status updates continue, frontend events panel still renders as before.

**Step 4: Manual log-file verification**

Run:

```bash
tail -n 30 backend/data/app.log
```

Expected: connection/service lifecycle entries present and formatted; file rotates when size limit exceeded.

**Step 5: Commit verification notes**

```bash
git add doc/plan/2026-02-24-backend-unified-logging-implementation-plan.md
git commit -m "Add verification notes for unified backend logging"
```
