from dataclasses import dataclass
import json
from typing import Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from backend.core.models import SensorState, snapshot
from backend.core.service import acknowledge_alarm
from backend.realtime.broadcaster import Broadcaster


@dataclass
class AppDeps:
    state: SensorState
    broadcaster: Broadcaster
    static_dir: str
    send_serial: Callable[[str], None]


def _build_serial_command(message: str) -> str | None:
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None

    cmd = payload.get("cmd")
    if cmd == "set_threshold":
        value = payload.get("value")
        if isinstance(value, int):
            return f"set th {value}"
        return None
    if cmd == "set_val":
        value = payload.get("value")
        if isinstance(value, int):
            return f"set val {value}"
        return None
    if cmd == "map":
        return "map"
    return None


def register_routes(app: FastAPI, deps: AppDeps) -> None:
    app.mount("/asset", StaticFiles(directory=f"{deps.static_dir}/asset"), name="assets")

    @app.get("/")
    async def index():
        return FileResponse(f"{deps.static_dir}/index.html")

    @app.get("/favicon.ico")
    async def favicon():
        return Response(status_code=204)

    @app.get("/.well-known/appspecific/com.chrome.devtools.json")
    async def chrome_devtools_well_known():
        return Response(status_code=204)

    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket):
        await deps.broadcaster.register(ws, snapshot(deps.state))
        try:
            while True:
                message = (await ws.receive_text()).strip()
                if message.lower() == "ack" and acknowledge_alarm(deps.state):
                    deps.broadcaster.enqueue(snapshot(deps.state))
                    continue
                serial_cmd = _build_serial_command(message)
                if serial_cmd:
                    deps.send_serial(serial_cmd)
        except WebSocketDisconnect:
            await deps.broadcaster.unregister(ws)
