# TPL Signum Web GUI - Safety Interlock for CNC

## Purpose

Web-based safety interlock monitor for CNC machines using the TPL Signum RF intruder detection system. Provides a large visual alarm indicator when an object passes through the detection zone between two 2.4GHz sensor units.

## Architecture

- **Backend**: Single Python file (`server.py`) using FastAPI + uvicorn
  - Background thread reads serial port continuously, parses events
  - WebSocket endpoint pushes events to all connected browsers
  - REST-style WebSocket commands for configuration (threshold, gain, map)
- **Frontend**: Single HTML file (`static/index.html`) with inline CSS/JS
  - Full-screen alarm indicator (green/red/yellow/gray)
  - Event log, settings modal, map popup
  - Web Audio API for alarm sound (no external files)
- **No database, no build tools, no npm**

## Serial Connection

- Port: `/dev/cu.usbserial-0001` (Silicon Labs CP210x)
- Settings: 57600 baud, 8N1, no flow control
- Line ending: `\r` (CR only)
- CLI has folder-based menu system (`mpedT` folder for config)

## UI Layout

1. **Status Banner (top ~60%)**: Giant colored panel
   - Green = CLEAR
   - Red (pulsing) = INTRUSION DETECTED
   - Yellow = COMM LOSS
   - Gray = DISCONNECTED
2. **Event Log (bottom ~30%)**: Last 50 events, newest first, color-coded
3. **Toolbar (bottom strip)**: Settings, Map, Mute, connection indicator

## Alarm Behavior

- Two modes, togglable in settings:
  - **Auto-reset**: Alarm clears after ~3-5s of no detections
  - **Manual acknowledge**: Alarm stays until operator clicks Acknowledge
- Audio alert repeats while in red state, mute button available

## Parsed Event Types

- `CMD:DETECTION` → intrusion event (val, threshold, count)
- `CMD:DETECTION-COMM` → communication loss between detectors
- `CMD:CONNECTED ... 0` → unit disconnection
- `CMD:CONNECTED ... 1` → unit connection
- `CMD:MAP_RSP` → system status response

## WebSocket Protocol

### Server → Client
```json
{"type": "detection", "unit_a": 11, "unit_b": 12, "threshold": 500, "value": 549, "count": 1, "timestamp": "..."}
{"type": "comm_loss", "unit_a": 12, "unit_b": 11, "timestamp": "..."}
{"type": "connected", "unit": 2, "peer": 11, "connected": false, "timestamp": "..."}
{"type": "map", "units": [{"id": 11, "gain": 32, "voltage": 2686, "peers": [...]}]}
{"type": "status", "serial_connected": true, "alarm_state": "clear"}
```

### Client → Server
```json
{"cmd": "set_threshold", "value": 500}
{"cmd": "set_gain", "value": 32}
{"cmd": "map"}
{"cmd": "acknowledge"}
```

## Dependencies

- Python 3.10+
- fastapi
- uvicorn
- pyserial
