import json
from dataclasses import dataclass
from pathlib import Path

from backend.api.routes import AppDeps, register_routes
from backend.core.layout_store import ALLOWED_BOUNDS, MAP_BUFFER_KM
from backend.core.models import SensorState
from fastapi import FastAPI
from fastapi.testclient import TestClient


@dataclass
class FakeBroadcaster:
    payload: dict

    async def register(self, ws, initial):
        await ws.accept()
        await ws.send_json(self.payload)

    async def unregister(self, ws):
        return None

    def enqueue(self, payload):
        self.payload = payload


def _build_app(
    tmp_path: Path,
    sent_cmds: list[str],
    persisted_layouts: list[dict] | None = None,
) -> tuple[TestClient, Path, FakeBroadcaster]:
    static_dir = tmp_path / "dist"
    asset_dir = static_dir / "asset"
    asset_dir.mkdir(parents=True)
    (static_dir / "index.html").write_text("<html>ok</html>", encoding="utf-8")
    tiles_dir = tmp_path / "tiles"
    tiles_dir.mkdir(parents=True)
    layout_state_path = tmp_path / "layout_state.json"
    saved_layouts: list[dict] = persisted_layouts if persisted_layouts is not None else []

    def save_layout(path: str | Path, state: dict) -> dict:
        saved_layouts.append({"path": str(path), "state": json.loads(json.dumps(state))})
        return state

    app = FastAPI()
    state = SensorState()
    state.map_policy = {
        "bounds": dict(ALLOWED_BOUNDS),
        "buffer_km": MAP_BUFFER_KM,
        "tile_root": "/tiles",
        "offline_required": True,
    }
    broadcaster = FakeBroadcaster(
        {
            "connected": False,
            "port": "None",
            "alarm": "disconnected",
            "events": [],
            "links": [],
            "crossing_alert": None,
            "config": {"threshold": None, "gain": None},
            "units": [],
            "map_policy": dict(state.map_policy),
            "sensor_status": {},
        }
    )
    deps = AppDeps(
        state=state,
        broadcaster=broadcaster,
        static_dir=str(static_dir),
        tiles_dir=str(tiles_dir),
        send_serial=sent_cmds.append,
        layout_state_path=layout_state_path,
        save_layout=save_layout,
    )
    register_routes(app, deps)
    return TestClient(app), layout_state_path, broadcaster


def test_websocket_routes_command_messages(tmp_path: Path):
    sent_cmds: list[str] = []
    client, _, _ = _build_app(tmp_path, sent_cmds)

    with client.websocket_connect("/ws") as ws:
        _ = ws.receive_json()
        ws.send_text('{"cmd":"set_threshold","value":500}')
        ws.send_text('{"cmd":"set_gain","value":64}')
        ws.send_text('{"cmd":"map"}')
        ws.send_text('{"cmd":"unsupported"}')

    assert sent_cmds == ["threshold 500", "gain 64", "map"]


def test_serves_favicon_without_404(tmp_path: Path):
    client, _, _ = _build_app(tmp_path, [])

    response = client.get("/favicon.ico")

    assert response.status_code == 204


def test_serves_chrome_devtools_well_known_without_404(tmp_path: Path):
    client, _, _ = _build_app(tmp_path, [])

    response = client.get("/.well-known/appspecific/com.chrome.devtools.json")

    assert response.status_code == 204


def test_map_policy_endpoint_returns_bounds_and_tile_metadata(tmp_path: Path):
    client, _, _ = _build_app(tmp_path, [])

    response = client.get("/api/map-policy")

    assert response.status_code == 200
    assert response.json() == {
        "bounds": dict(ALLOWED_BOUNDS),
        "buffer_km": MAP_BUFFER_KM,
        "tile_root": "/tiles",
        "offline_required": True,
    }


def test_set_unit_position_updates_state_and_persists(tmp_path: Path):
    sent_cmds: list[str] = []
    persisted_layouts: list[dict] = []
    client, layout_path, broadcaster = _build_app(tmp_path, sent_cmds, persisted_layouts)

    with client.websocket_connect("/ws") as ws:
        _ = ws.receive_json()
        ws.send_text('{"cmd":"set_unit_position","unit_id":7,"lat":33.31,"lng":35.78}')

    assert sent_cmds == []
    assert len(persisted_layouts) == 1
    assert persisted_layouts[0]["path"] == str(layout_path)
    assert persisted_layouts[0]["state"]["units"] == [
        {"id": 7, "label": "S7", "lat": 33.31, "lng": 35.78}
    ]
    assert broadcaster.payload["units"] == [{"id": 7, "label": "S7", "lat": 33.31, "lng": 35.78}]


def test_set_unit_position_rejects_out_of_bounds(tmp_path: Path):
    sent_cmds: list[str] = []
    persisted_layouts: list[dict] = []
    client, _, broadcaster = _build_app(tmp_path, sent_cmds, persisted_layouts)

    with client.websocket_connect("/ws") as ws:
        initial = ws.receive_json()
        ws.send_text('{"cmd":"set_unit_position","unit_id":7,"lat":40.0,"lng":35.78}')

    assert initial["units"] == []
    assert sent_cmds == []
    assert persisted_layouts == []
    assert broadcaster.payload["units"] == []


def test_set_unit_position_rejects_nan_coordinates(tmp_path: Path):
    sent_cmds: list[str] = []
    persisted_layouts: list[dict] = []
    client, _, broadcaster = _build_app(tmp_path, sent_cmds, persisted_layouts)

    with client.websocket_connect("/ws") as ws:
        initial = ws.receive_json()
        ws.send_text('{"cmd":"set_unit_position","unit_id":7,"lat":"NaN","lng":35.78}')

    assert initial["units"] == []
    assert persisted_layouts == []


def test_set_unit_position_rejects_infinity_coordinates(tmp_path: Path):
    sent_cmds: list[str] = []
    persisted_layouts: list[dict] = []
    client, _, broadcaster = _build_app(tmp_path, sent_cmds, persisted_layouts)

    with client.websocket_connect("/ws") as ws:
        _ = ws.receive_json()
        payload = {"cmd": "set_unit_position", "unit_id": 7, "lat": float("inf"), "lng": 35.78}
        ws.send_text(json.dumps(payload))

    assert persisted_layouts == []


def test_set_unit_position_rejects_negative_unit_id(tmp_path: Path):
    sent_cmds: list[str] = []
    persisted_layouts: list[dict] = []
    client, _, broadcaster = _build_app(tmp_path, sent_cmds, persisted_layouts)

    with client.websocket_connect("/ws") as ws:
        _ = ws.receive_json()
        ws.send_text('{"cmd":"set_unit_position","unit_id":-1,"lat":33.31,"lng":35.78}')

    assert persisted_layouts == []


def test_tiles_route_serves_local_file(tmp_path: Path):
    client, _, _ = _build_app(tmp_path, [])
    tile_file = tmp_path / "tiles" / "manifest.json"
    tile_file.write_text('{"version":"test"}', encoding="utf-8")

    response = client.get("/tiles/manifest.json")

    assert response.status_code == 200
    assert response.json() == {"version": "test"}
