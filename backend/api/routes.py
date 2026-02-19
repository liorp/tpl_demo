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
from backend.core.service import acknowledge_alarm
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


def _within_bounds(lat: float, lng: float, bounds: dict[str, float] | None) -> bool:
    if not bounds:
        bounds = ALLOWED_BOUNDS
    return bounds["south"] <= lat <= bounds["north"] and bounds["west"] <= lng <= bounds["east"]


def _set_unit_position(deps: AppDeps, payload: dict[str, Any]) -> bool:
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

    next_lat = float(lat)
    next_lng = float(lng)
    bounds = deps.state.map_policy.get("bounds")
    if not isinstance(bounds, dict) or not _within_bounds(next_lat, next_lng, bounds):
        return False

    with deps.state.lock:
        updated = False
        for unit in deps.state.units:
            if unit.get("id") == unit_id:
                unit["lat"] = next_lat
                unit["lng"] = next_lng
                if "label" not in unit:
                    unit["label"] = f"S{unit_id}"
                updated = True
                break
        if not updated:
            deps.state.units.append(
                {
                    "id": unit_id,
                    "label": f"S{unit_id}",
                    "lat": next_lat,
                    "lng": next_lng,
                }
            )
        current_units = list(deps.state.units)
        current_policy = dict(deps.state.map_policy)

    persisted = deps.save_layout(
        deps.layout_state_path,
        {"units": current_units, "map_policy": current_policy},
    )
    with deps.state.lock:
        deps.state.units = persisted["units"]
        deps.state.map_policy = persisted["map_policy"]
    deps.broadcaster.enqueue(snapshot(deps.state))
    return True


def register_routes(app: FastAPI, deps: AppDeps) -> None:
    app.mount("/asset", StaticFiles(directory=f"{deps.static_dir}/asset"), name="assets")
    app.mount("/tiles", StaticFiles(directory=deps.tiles_dir, check_dir=False), name="tiles")

    @app.get("/")
    async def index():
        return FileResponse(f"{deps.static_dir}/index.html")

    @app.get("/api/map-policy")
    async def map_policy():
        with deps.state.lock:
            current = {
                "bounds": dict(deps.state.map_policy.get("bounds") or ALLOWED_BOUNDS),
                "buffer_km": deps.state.map_policy.get("buffer_km"),
                "tile_root": deps.state.map_policy.get("tile_root"),
                "offline_required": deps.state.map_policy.get("offline_required"),
            }
        return current

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
                if _set_unit_position(deps, payload):
                    continue
                serial_cmd = _build_serial_command(payload)
                if serial_cmd:
                    deps.send_serial(serial_cmd)
        except WebSocketDisconnect:
            await deps.broadcaster.unregister(ws)
