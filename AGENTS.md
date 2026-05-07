# Repository Guidelines

## Project Structure & Module Organization
This repository is split into a Python backend and a React/TypeScript frontend.

- `backend/`: FastAPI service (`backend/main.py`) with domain modules in `api/`, `core/`, `parsing/`, `realtime/`, and `serial/`.
- `backend/test/`: Pytest suites grouped by domain (`core/`, `parsing/`, `realtime/`, `architecture/`).
- `frontend/src/`: UI and client logic. Main app entry is `src/main.tsx`, with feature code under `src/domain/**` and app shell in `src/app/`.
- `frontend/dist/`: Built frontend assets.
- `scripts/`: Utility scripts:
  - `scripts/demo-backend.sh`: waits for dummy device port file and launches backend with `SERIAL_PORT`.
  - `scripts/probe_sensor.py`: probes a TPL USB sensor over serial for diagnostics.
- `docs/plans/`: Design/planning documents.

## Build, Test, and Development Commands
Run all commands from repo root unless noted.

- `bun run dev`: Starts frontend watcher and backend API together.
- `bun run dev:frontend`: Frontend watch build only.
- `bun run dev:backend`: Backend with `uvicorn` reload on port `8181` by default.
- `bun run demo`: Starts dummy device, backend, and frontend watcher together. It writes the dummy serial PTY to `/tmp/tpl-dummy-port` and runs the backend with that `SERIAL_PORT`. The script invokes `python`; on machines with only `python3`, provide a `python` shim or alias.
- `bun run build`: Production frontend build into `frontend/dist/`.
- `bun run lint`: Runs Biome checks for frontend code.
- `bun run test`: Runs frontend (`vitest`) then backend (`pytest`) tests.
- `bun run test:frontend` / `bun run test:backend`: Run one test stack.

## Device Operation & AT Commands
The backend is the only process that should talk directly to the TPL device during normal app operation. It opens serial at `57600` baud, 8-N-1, no flow control. Set `SERIAL_PORT=/dev/...` to force a specific port; otherwise the backend scans non-Bluetooth USB/ACM/ttyUSB/COM-style ports. `TPL_BACKEND_PORT` overrides the backend HTTP port.

On connection, the backend sends `AT#GETVERSION?` and treats a valid version/map/detection/link event as protocol validation. Serial commands are written with carriage return (`\r`) and paced: one queued command is sent at a time until `OK` or `ERROR` is received, with a 2s ack timeout. After validation, the backend requests `AT#REQMESHMAP=0` every 10s as a heartbeat. `ATCMD_CLI_READY` causes an immediate map request.

Supported WebSocket command payloads and their device effect:

- `{"cmd":"set_threshold","unit_a":A,"unit_b":B,"value":N}` -> `AT#SETDETTHR=A,B,N`. Requires non-negative integer units, different units, and `0..65534` threshold.
- `{"cmd":"set_gain","unit_a":A,"unit_b":B,"value":N}` -> `AT#SETDETGAIN=A,B,N`. Requires non-negative integer units, different units, and non-negative gain.
- `{"cmd":"map","unit":U}` -> `AT#REQMESHMAP=U`; omitted or invalid `unit` becomes `0` (all units).
- `{"cmd":"ping","unit":U}` -> `AT#PING=U`; omitted or invalid `unit` becomes `0` (all units).
- `{"cmd":"set_active_antenna","unit":U,"antenna":1|2}` -> `AT#SETACTANT=U,A`. Antenna `1` is internal and `2` is external.
- `{"cmd":"request_active_antenna","unit":U}` -> `AT#REQACTANT=U`; omitted or invalid `unit` becomes `0`.
- `{"cmd":"set_detection_mode","mode":1|2,"internal_data":HEX}` -> `AT#SETDETMODE=MODE,HEX`. `internal_data` is optional and defaults to empty.
- `{"cmd":"request_detection_mode"}` -> `AT#REQDETMODE`.
- `{"cmd":"get_version"}` -> `AT#GETVERSION?`.
- `{"cmd":"reset"}` -> `AT#RESET`.
- `ack` as plain text acknowledges/clears the app alarm and is not sent to serial.
- `{"cmd":"set_detection_threshold","value":N}` updates the backend/app alarm threshold only; it is not an AT command. It is rejected when below the current noise threshold.
- `{"cmd":"set_unit_position","unit_id":U,"lat":LAT,"lng":LNG}` persists the map position only; it is not an AT command and must stay inside allowed map bounds.

The parser currently understands these device response/event lines: `OK`, `ERROR`, `ATCMD_CLI_READY`, `#GETVERSION:...`, `#EVTDETECT=A,B,value,threshold`, `#EVTDETCOM=A,B,no_comm_ms,no_comm_threshold`, `#EVTMESHLINKUP=reporting,linked,rssi,threshold_cfg,gain_cfg,...`, `#EVTMESHLINKDOWN=reporting,linked,last_rssi,reason`, `#EVTMESHMAPDEV=unit,"version",voltage,...`, `#EVTMESHMAPDEVLINK=reporting,linked,rssi,threshold,gain,...`, `#EVTACTANT=unit,active,supported`, `#EVTDETMODE=mode,internal_data`, `#PINGRSP=unit,ms`, `#EVTPINGRSP=unit,ms`, `#EVTERR: number,text`, and `#EVTTRACE: text`.

For diagnostics with real hardware, run `python3 scripts/probe_sensor.py` to auto-detect a USB serial device, or pass the port explicitly. The probe script sends legacy/manual commands (`/`, `cmd`, `re 3 4`, `mpedT`, `map`) and is separate from the app's `AT#...` backend protocol. Use `python3 dummy_device.py --port-file /tmp/tpl-dummy-port` for simulator-only serial testing.

## Coding Style & Naming Conventions
- Frontend formatting/linting is enforced by Biome (`frontend/biome.json`): 2-space indent, single quotes, semicolons required.
- React components use `PascalCase` filenames (for example `StatusStrip.tsx`); utility and service modules use `camelCase`/lowercase (for example `monitorSocket.ts`).
- Backend follows standard Python conventions: 4-space indent, `snake_case` functions/modules, typed models in `backend/core/models.py`.

## Testing Guidelines
- **Use TDD**: Write a failing test first, then implement the minimal fix, then verify all tests pass.
- Backend: `pytest` with tests under `backend/test/` named `test_*.py`.
- Frontend: `vitest` with colocated tests like `*.test.ts`.
- Add or update tests in the same domain area as the change.
- Before claiming work is done, **always run `bun run test` and `bun run lint`** and verify they pass.
- For UI and integration changes, verify with **Playwright via `bun run demo`** to confirm end-to-end behavior works.

## Commit & Pull Request Guidelines
Current history uses short, imperative commit subjects (for example: `Add ...`, `Initial commit`). Keep commits focused and descriptive.

For pull requests:
- Explain what changed and why.
- Link related issue/task IDs.
- Include screenshots or recordings for UI changes.
- Note local verification steps and results (`bun run lint`, `bun run test`).
