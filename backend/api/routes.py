import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from backend.core.layout_store import ALLOWED_BOUNDS, save_layout_state
from backend.core.models import SensorState, snapshot
from backend.core.service import acknowledge_alarm, set_unit_position
from backend.realtime.broadcaster import Broadcaster


@dataclass
class AppDeps:
    state: SensorState
    broadcaster: Broadcaster
    static_dir: str
    tiles_dir: str
    send_serial: Callable[[str], None]
    layout_state_path: str | Path
    save_layout: Callable[[str | Path, dict[str, Any]], dict[str, Any]] = save_layout_state


def _build_serial_command(payload: dict[str, Any]) -> str | None:
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
        deps.state, unit_id, float(lat), float(lng),
        deps.save_layout, deps.layout_state_path,
    )
    if changed:
        deps.broadcaster.enqueue(snapshot(deps.state))
    return changed


def register_routes(app: FastAPI, deps: AppDeps) -> None:
    app.mount("/asset", StaticFiles(directory=f"{deps.static_dir}/asset"), name="assets")
    app.mount("/tiles", StaticFiles(directory=deps.tiles_dir, check_dir=False), name="tiles")

    @app.get("/")
    async def index():
        return FileResponse(f"{deps.static_dir}/index.html")

    @app.get("/api/map-policy")
    async def map_policy():
        return {
            "bounds": dict(deps.state.map_policy.get("bounds") or ALLOWED_BOUNDS),
            "buffer_km": deps.state.map_policy.get("buffer_km"),
            "tile_root": deps.state.map_policy.get("tile_root"),
            "offline_required": deps.state.map_policy.get("offline_required"),
        }

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
                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    payload = None
                if not isinstance(payload, dict):
                    continue
                if _handle_unit_position(deps, payload):
                    continue
                serial_cmd = _build_serial_command(payload)
                if serial_cmd:
                    deps.send_serial(serial_cmd)
        except WebSocketDisconnect:
            await deps.broadcaster.unregister(ws)
