import asyncio
import json
import re
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import serial
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# --- Configuration ---
SERIAL_PORT = "/dev/cu.usbserial-0001"
BAUD_RATE = 57600
AUTO_RESET_TIMEOUT = 4.0  # seconds

# --- ANSI escape code stripper ---
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

# --- Event parsing regexes ---
DETECTION_RE = re.compile(
    r"CMD:DETECTION\s+(\w+)\((\d+)\)-(\w+)\((\d+)\)\s+th:(\d+)\s+val:(\d+)\s+c:(\d+)"
)
DETECTION_COMM_RE = re.compile(
    r"CMD:DETECTION-COMM\s+(\w+)\((\d+)\)-(\w+)\((\d+)\)\s+(\d+)"
)
CONNECTED_RE = re.compile(
    r"CMD:CONNECTED\s+(\w+)\((\d+)\)\s+connected:(\w+)\((\d+)\)\s+([01])"
)
MAP_RSP_RE = re.compile(
    r"CMD:MAP_RSP\s+from\s+(\d+)\s+ver:(\S+)\s+gain:(\d+)\s+voltage:(\d+)\s+scan:(\d+)\s+adv:(\d+):\s+(.*)"
)
MAP_PEER_RE = re.compile(
    r"\[(\d+)\s+th3:(\d+)\s+(-?\d+)dBm\s+dt:(\d+)\]"
)
TIMESTAMP_RE = re.compile(r"^\[(\d+)\]\s+I\s+(.*)")


class SensorState:
    def __init__(self):
        self.serial_connected = False
        self.alarm_state = "disconnected"  # clear, alarm, comm_loss, disconnected
        self.alarm_mode = "auto"  # auto or manual
        self.last_detection_time = 0.0
        self.events: list[dict] = []
        self.max_events = 50
        self.map_data: list[dict] = []
        self.websockets: list[WebSocket] = []
        self.lock = threading.Lock()
        self.serial_conn: serial.Serial | None = None
        self.serial_lock = threading.Lock()
        self._acknowledged = False
        self.detection_enabled = True
        self.saved_threshold = 500

    def add_event(self, event: dict):
        with self.lock:
            self.events.insert(0, event)
            if len(self.events) > self.max_events:
                self.events.pop()

    def set_alarm(self, state: str):
        with self.lock:
            if state == "alarm" and self.alarm_state == "alarm" and self._acknowledged:
                # In manual mode, if already acknowledged, new detections re-trigger
                if self.alarm_mode == "manual":
                    self._acknowledged = False
            prev = self.alarm_state
            self.alarm_state = state
            if state != prev:
                self._acknowledged = False

    def acknowledge(self):
        with self.lock:
            self._acknowledged = True
            if self.alarm_mode == "manual":
                self.alarm_state = "clear"

    def get_effective_state(self) -> str:
        with self.lock:
            if self.alarm_state == "alarm" and self.alarm_mode == "manual" and self._acknowledged:
                return "clear"
            return self.alarm_state


state = SensorState()


def parse_line(raw_line: str) -> dict | None:
    line = ANSI_RE.sub("", raw_line).strip()
    if not line:
        return None

    ts_match = TIMESTAMP_RE.match(line)
    if not ts_match:
        return None

    device_ts = int(ts_match.group(1))
    content = ts_match.group(2)
    now = datetime.now().isoformat(timespec="milliseconds")

    m = DETECTION_RE.search(content)
    if m:
        event = {
            "type": "detection",
            "unit_a": int(m.group(2)),
            "unit_b": int(m.group(4)),
            "id_a": m.group(1),
            "id_b": m.group(3),
            "threshold": int(m.group(5)),
            "value": int(m.group(6)),
            "count": int(m.group(7)),
            "device_ts": device_ts,
            "timestamp": now,
        }
        return event

    m = DETECTION_COMM_RE.search(content)
    if m:
        return {
            "type": "comm_loss",
            "unit_a": int(m.group(2)),
            "unit_b": int(m.group(4)),
            "id_a": m.group(1),
            "id_b": m.group(3),
            "value": int(m.group(5)),
            "device_ts": device_ts,
            "timestamp": now,
        }

    m = CONNECTED_RE.search(content)
    if m:
        return {
            "type": "connected",
            "unit": int(m.group(2)),
            "id_unit": m.group(1),
            "peer": int(m.group(4)),
            "id_peer": m.group(3),
            "connected": m.group(5) == "1",
            "device_ts": device_ts,
            "timestamp": now,
        }

    m = MAP_RSP_RE.search(content)
    if m:
        peers_str = m.group(7)
        peers = []
        for pm in MAP_PEER_RE.finditer(peers_str):
            peers.append({
                "id": int(pm.group(1)),
                "threshold": int(pm.group(2)),
                "rssi": int(pm.group(3)),
                "dt": int(pm.group(4)),
            })
        return {
            "type": "map",
            "unit_id": int(m.group(1)),
            "version": m.group(2),
            "gain": int(m.group(3)),
            "voltage": int(m.group(4)),
            "peers": peers,
            "device_ts": device_ts,
            "timestamp": now,
        }

    return None


def send_serial(cmd: str):
    """Send a command to the serial port."""
    with state.serial_lock:
        if state.serial_conn and state.serial_conn.is_open:
            state.serial_conn.write((cmd + "\r").encode())


def serial_reader_thread():
    """Background thread that reads from serial port and parses events."""
    while True:
        try:
            ser = serial.Serial(
                SERIAL_PORT, BAUD_RATE, timeout=1,
                bytesize=serial.EIGHTBITS, parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE, xonxoff=False, rtscts=False,
            )
            with state.serial_lock:
                state.serial_conn = ser
            state.serial_connected = True
            state.set_alarm("clear")
            broadcast_status()

            # Enable detection display: navigate to cmd folder, enable re 3 4
            time.sleep(0.5)
            ser.reset_input_buffer()
            send_serial("/")
            time.sleep(0.3)
            send_serial("cmd")
            time.sleep(0.3)
            send_serial("re 3 4")
            time.sleep(0.3)

            buffer = ""
            while True:
                data = ser.read(ser.in_waiting or 1)
                if not data:
                    # Check auto-reset timeout
                    check_auto_reset()
                    continue

                text = data.decode("utf-8", errors="replace")
                buffer += text

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    event = parse_line(line)
                    if event:
                        handle_event(event)

                check_auto_reset()

        except serial.SerialException:
            state.serial_connected = False
            state.set_alarm("disconnected")
            with state.serial_lock:
                state.serial_conn = None
            broadcast_status()
            time.sleep(2)  # Retry after delay
        except Exception as e:
            print(f"Serial reader error: {e}")
            time.sleep(2)


def check_auto_reset():
    if state.alarm_mode == "auto" and state.alarm_state == "alarm":
        if time.time() - state.last_detection_time > AUTO_RESET_TIMEOUT:
            state.set_alarm("clear")
            broadcast_status()


def handle_event(event: dict):
    event_type = event["type"]

    if event_type == "detection":
        state.last_detection_time = time.time()
        state.set_alarm("alarm")
    elif event_type == "comm_loss":
        state.set_alarm("comm_loss")
    elif event_type == "connected":
        if not event["connected"]:
            # A unit disconnected - could affect system health
            pass
    elif event_type == "map":
        with state.lock:
            # Update or add to map data
            state.map_data = [u for u in state.map_data if u["unit_id"] != event["unit_id"]]
            state.map_data.append(event)
            state.map_data.sort(key=lambda u: u["unit_id"])

    if event_type != "map":
        state.add_event(event)

    broadcast_event(event)
    broadcast_status()


# --- Async broadcast helpers ---
_broadcast_queue: asyncio.Queue | None = None


def broadcast_event(event: dict):
    msg = json.dumps(event)
    if _broadcast_queue:
        _broadcast_queue.put_nowait(("event", msg))


def broadcast_status():
    status = {
        "type": "status",
        "serial_connected": state.serial_connected,
        "alarm_state": state.get_effective_state(),
        "alarm_mode": state.alarm_mode,
        "detection_enabled": state.detection_enabled,
    }
    msg = json.dumps(status)
    if _broadcast_queue:
        _broadcast_queue.put_nowait(("status", msg))


async def broadcast_worker():
    """Async worker that sends queued messages to all WebSocket clients."""
    while True:
        kind, msg = await _broadcast_queue.get()
        disconnected = []
        for ws in state.websockets:
            try:
                await ws.send_text(msg)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            if ws in state.websockets:
                state.websockets.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _broadcast_queue
    _broadcast_queue = asyncio.Queue()

    # Start broadcast worker
    task = asyncio.create_task(broadcast_worker())

    # Start serial reader in background thread
    thread = threading.Thread(target=serial_reader_thread, daemon=True)
    thread.start()

    yield

    task.cancel()


app = FastAPI(lifespan=lifespan)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    state.websockets.append(ws)

    # Send current state on connect
    status = {
        "type": "status",
        "serial_connected": state.serial_connected,
        "alarm_state": state.get_effective_state(),
        "alarm_mode": state.alarm_mode,
        "detection_enabled": state.detection_enabled,
    }
    await ws.send_text(json.dumps(status))

    # Send existing events
    with state.lock:
        for event in state.events:
            await ws.send_text(json.dumps(event))

    # Send map data if available
    with state.lock:
        if state.map_data:
            await ws.send_text(json.dumps({
                "type": "map_full",
                "units": state.map_data,
            }))

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            await handle_ws_command(msg)
    except WebSocketDisconnect:
        if ws in state.websockets:
            state.websockets.remove(ws)


async def handle_ws_command(msg: dict):
    cmd = msg.get("cmd")

    if cmd == "set_threshold":
        value = int(msg["value"])
        state.saved_threshold = value
        state.detection_enabled = True
        send_serial("/")
        await asyncio.sleep(0.2)
        send_serial("mpedT")
        await asyncio.sleep(0.2)
        send_serial(f"threshold {value}")
        await asyncio.sleep(0.5)
        # Go back to cmd for detection display
        send_serial("/")
        await asyncio.sleep(0.2)
        send_serial("cmd")
        await asyncio.sleep(0.2)
        send_serial("re 3 4")

    elif cmd == "set_gain":
        value = int(msg["value"])
        send_serial("/")
        await asyncio.sleep(0.2)
        send_serial("mpedT")
        await asyncio.sleep(0.2)
        send_serial(f"gain {value}")
        await asyncio.sleep(0.5)
        send_serial("/")
        await asyncio.sleep(0.2)
        send_serial("cmd")
        await asyncio.sleep(0.2)
        send_serial("re 3 4")

    elif cmd == "map":
        send_serial("/")
        await asyncio.sleep(0.2)
        send_serial("cmd")
        await asyncio.sleep(0.2)
        send_serial("map")

    elif cmd == "acknowledge":
        state.acknowledge()
        broadcast_status()

    elif cmd == "toggle_detection":
        state.detection_enabled = not state.detection_enabled
        if state.detection_enabled:
            value = state.saved_threshold
        else:
            value = 0
        send_serial("/")
        await asyncio.sleep(0.2)
        send_serial("mpedT")
        await asyncio.sleep(0.2)
        send_serial(f"threshold {value}")
        await asyncio.sleep(0.5)
        send_serial("/")
        await asyncio.sleep(0.2)
        send_serial("cmd")
        await asyncio.sleep(0.2)
        send_serial("re 3 4")
        broadcast_status()

    elif cmd == "set_alarm_mode":
        mode = msg.get("mode", "auto")
        if mode in ("auto", "manual"):
            state.alarm_mode = mode
            broadcast_status()


# Serve static files
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")


@app.get("/")
async def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
