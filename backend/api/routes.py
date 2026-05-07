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
from backend.parsing.encoder import (
    format_get_version,
    format_ping,
    format_request_active_antenna,
    format_request_detection_mode,
    format_request_map,
    format_reset,
    format_set_active_antenna,
    format_set_detection_mode,
    format_set_gain,
    format_set_threshold,
)
from backend.realtime.broadcaster import Broadcaster


def _is_strict_int(value: Any) -> bool:
    return type(value) is int


def _is_json_number(value: Any) -> bool:
    return type(value) is int or type(value) is float


def _is_non_negative_int(value: Any) -> bool:
    return _is_strict_int(value) and value >= 0


@dataclass
class AppDeps:
    state: SensorState
    broadcaster: Broadcaster
    static_dir: str
    tiles_dir: str
    send_serial: Callable[[str], None]
    layout_state_path: str | Path
    save_layout: Callable[[str | Path, dict[str, Any]], dict[str, Any]] = save_layout_state


def _has_pair_value(payload: dict[str, Any]) -> bool:
    return (
        _is_non_negative_int(payload.get("unit_a"))
        and _is_non_negative_int(payload.get("unit_b"))
        and _is_non_negative_int(payload.get("value"))
        and payload["unit_a"] != payload["unit_b"]
    )


def _build_serial_command(payload: dict[str, Any]) -> str | None:
    cmd = payload.get("cmd")
    try:
        if cmd == "set_threshold":
            if not _has_pair_value(payload):
                return None
            return format_set_threshold(
                payload["unit_a"], payload["unit_b"], payload["value"]
            )
        if cmd == "set_gain":
            if not _has_pair_value(payload):
                return None
            return format_set_gain(
                payload["unit_a"], payload["unit_b"], payload["value"]
            )
        if cmd == "map":
            unit = payload.get("unit", 0)
            return format_request_map(unit if _is_non_negative_int(unit) else 0)
        if cmd == "ping":
            unit = payload.get("unit", 0)
            return format_ping(unit if _is_non_negative_int(unit) else 0)
        if cmd == "set_active_antenna":
            unit = payload.get("unit")
            antenna = payload.get("antenna")
            if not _is_non_negative_int(unit) or not _is_strict_int(antenna):
                return None
            return format_set_active_antenna(unit, antenna)
        if cmd == "request_active_antenna":
            unit = payload.get("unit", 0)
            return format_request_active_antenna(
                unit if _is_non_negative_int(unit) else 0
            )
        if cmd == "set_detection_mode":
            mode = payload.get("mode")
            if not _is_strict_int(mode):
                return None
            internal = payload.get("internal_data", "")
            if not isinstance(internal, str):
                return None
            return format_set_detection_mode(mode, internal)
        if cmd == "request_detection_mode":
            return format_request_detection_mode()
        if cmd == "get_version":
            return format_get_version()
        if cmd == "reset":
            return format_reset()
    except ValueError:
        return None
    return None


def _handle_unit_position(deps: AppDeps, payload: dict[str, Any]) -> bool:
    if payload.get("cmd") != "set_unit_position":
        return False
    unit_id = payload.get("unit_id")
    lat = payload.get("lat")
    lng = payload.get("lng")
    if (
        not _is_strict_int(unit_id)
        or not _is_json_number(lat)
        or not _is_json_number(lng)
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
    app.mount(
        "/asset",
        StaticFiles(directory=f"{deps.static_dir}/asset", check_dir=False),
        name="assets",
    )
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
