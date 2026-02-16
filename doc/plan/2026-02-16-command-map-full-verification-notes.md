# Command Map Full Verification Notes

Date: 2026-02-16

## Automated Verification

- `bun run lint` -> PASS
- `bun run test` -> PASS
  - frontend vitest: 8 tests passed
  - backend pytest: 11 tests passed

## Backend Packaging/Runner Verification

- `uv run --project backend python -c "import backend.main; print('backend-import-ok')"` -> PASS
- Fixed backend packaging blockers in `backend/pyproject.toml`:
  - readme path now points to `../AGENTS.md`
  - explicit wheel package selection: `packages = ["backend"]`

## Hardware Verification (Connected Unit)

Device paths provided:
- `/dev/cu.usbserial-0001`
- `/dev/tty.usbserial-0001`

Command run:

```bash
uv run --project backend python - <<'PY'
import serial
port='/dev/cu.usbserial-0001'
ser=serial.Serial(port, 57600, timeout=1)
print('serial-open-ok', ser.is_open)
ser.write(b'\r')
ser.close()
print('serial-close-ok')
PY
```

Observed output:
- `serial-open-ok True`
- `serial-close-ok`

Interpretation:
- OS device is accessible and backend runtime can open/close the real unit at 57600 baud.

## Remaining Manual UI Verification

Still recommended in browser while backend is running:
- unit placement clicks on map
- pairing toggles and link overlay rendering
- config apply (`threshold`, `val`) command emission
- persistent crossing alert + acknowledge flow
