# Command Map Gaps Full-System Verification Notes

Date: 2026-02-17

## Automated Verification

1. `bun run lint`
- Result: PASS
- Notes: Biome checks passed for all frontend files.

2. `bun run test`
- Result: PASS
- Frontend: 11 test files, 47 tests passed.
- Backend: 31 tests passed.

## Targeted Verification During Implementation

- `uv run --project backend pytest backend/test/core/test_service.py -v`
  - PASS (16 passed)
- `uv run --project backend pytest backend/test/api/test_routes.py -v`
  - PASS (7 passed)
- `cd frontend && bun run test -- monitorState monitorSocket`
  - PASS
- `cd frontend && bun run test -- MonitorMap App`
  - PASS
- `cd frontend && bun run test -- CrossingAlertBanner App`
  - PASS

## Manual Smoke Checks

Executed:
- `GET /api/map-policy` against running app (`127.0.0.1:8080`): PASS
- `GET /tiles/manifest.json` against running app (`127.0.0.1:8080`): PASS
- Two-client WebSocket sync smoke (`set_unit_position` from client A observed by client B): PASS

Executed:
- Dummy-device serial end-to-end smoke (`backend/dummy_device.py` + backend on `127.0.0.1:18083`): PASS
  - Observed websocket progression through connected/map/detection events.
  - Observed `crossing_alert` payloads after detection events.
  - Root cause of prior failure was harness timing/connection sequence (non-deterministic startup), not backend logic.
