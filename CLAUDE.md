# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Web-based safety interlock monitor for CNC machines using the TPL Signum RF intruder detection system. Shows a large visual alarm when an object passes through the detection zone between two 2.4GHz sensor units.

## Running the Project

```bash
pip install -r requirements.txt
python server.py              # starts on http://0.0.0.0:8080
# or: uvicorn server:app --reload --host 0.0.0.0 --port 8080
```

No build step, no npm, no database. The HTML file is served directly by FastAPI.

## Architecture

Two files do everything:

- **`server.py`** (~450 lines) — FastAPI backend
- **`static/index.html`** (~875 lines) — Complete frontend with inline CSS/JS

### Backend (`server.py`)

**Serial → Parse → Broadcast pipeline:**
1. Background daemon thread reads serial port (`/dev/cu.usbserial-0001`, 57600 baud)
2. Each line is matched against regex patterns (`DETECTION_RE`, `DETECTION_COMM_RE`, `CONNECTED_RE`, `MAP_RSP_RE`)
3. Matched events go through `handle_event()` which updates `SensorState` (thread-safe via `threading.Lock`)
4. Events are put on `_broadcast_queue` (asyncio.Queue — bridges thread→async)
5. `broadcast_worker()` sends JSON to all connected WebSocket clients

**WebSocket commands** (client→server): `set_threshold`, `set_gain`, `map`, `acknowledge`, `toggle_detection`, `set_alarm_mode`. Each writes to the serial device with timing delays.

**Alarm logic:** Auto mode resets after 4s of no detections. Manual mode stays alarmed until operator acknowledges.

### Frontend (`static/index.html`)

- **Status banner** (top): Full-screen colored indicator (green/red/yellow/gray)
- **Map** (center): Leaflet.js with draggable sensor markers, mesh lines, detection ellipse
- **Event log** (bottom): Last 50 events table
- **Toolbar**: Settings, Map, Mute buttons + connection dot

State persisted in `localStorage`: sensor marker positions, map zoom/center, coordinates.

Audio alarm uses Web Audio API (880/440 Hz square wave, no audio files).

### Serial Protocol

The device uses a CLI with folder-based menu system. Commands need timing delays between them:
- `/` — go to root
- `cmd` — enter command folder
- `mpedT` — enter config folder
- `threshold N` / `gain N` — set values
- `map` — request network status
- `re 3 4` — reset detection between units

## WebSocket Protocol

Server→Client event types: `detection`, `comm_loss`, `connected`, `map`, `status`
Client→Server commands: `set_threshold`, `set_gain`, `map`, `acknowledge`, `toggle_detection`, `set_alarm_mode`

See `docs/plans/2025-02-11-tpl-signum-web-gui-design.md` for full message schemas.

## Key Constants

- `SERIAL_PORT = "/dev/cu.usbserial-0001"` — Silicon Labs CP210x USB adapter
- `BAUD_RATE = 57600`
- `AUTO_RESET_TIMEOUT = 4.0` seconds
- Sensor IDs: 1 (USB Controller), 2 (Mesh Relay), 11 (Detector A), 12 (Detector B)
