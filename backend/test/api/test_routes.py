from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.routes import AppDeps, register_routes
from backend.core.models import SensorState


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


def _build_app(tmp_path: Path, sent_cmds: list[str]) -> TestClient:
    static_dir = tmp_path / "dist"
    asset_dir = static_dir / "asset"
    asset_dir.mkdir(parents=True)
    (static_dir / "index.html").write_text("<html>ok</html>", encoding="utf-8")

    app = FastAPI()
    deps = AppDeps(
        state=SensorState(),
        broadcaster=FakeBroadcaster(
            {
                "connected": False,
                "port": "None",
                "alarm": "disconnected",
                "events": [],
                "links": [],
                "crossing_alert": None,
                "config": {"threshold": None, "val": None},
            }
        ),
        static_dir=str(static_dir),
        send_serial=sent_cmds.append,
    )
    register_routes(app, deps)
    return TestClient(app)


def test_websocket_routes_command_messages(tmp_path: Path):
    sent_cmds: list[str] = []
    client = _build_app(tmp_path, sent_cmds)

    with client.websocket_connect("/ws") as ws:
        _ = ws.receive_json()
        ws.send_text('{"cmd":"set_threshold","value":500}')
        ws.send_text('{"cmd":"set_val","value":549}')
        ws.send_text('{"cmd":"map"}')
        ws.send_text('{"cmd":"unsupported"}')

    assert sent_cmds == ["set th 500", "set val 549", "map"]


def test_serves_favicon_without_404(tmp_path: Path):
    client = _build_app(tmp_path, [])

    response = client.get("/favicon.ico")

    assert response.status_code == 204


def test_serves_chrome_devtools_well_known_without_404(tmp_path: Path):
    client = _build_app(tmp_path, [])

    response = client.get("/.well-known/appspecific/com.chrome.devtools.json")

    assert response.status_code == 204
