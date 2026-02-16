import asyncio
import logging
import threading
import time
from pathlib import Path

from fastapi import FastAPI

from backend.api.routes import AppDeps, register_routes
from backend.config import AUTO_RESET_TIMEOUT, SERIAL_PORT
from backend.core.models import SensorState, snapshot
from backend.core.service import check_auto_reset, handle_event, mark_disconnected, set_connection_state
from backend.realtime.broadcaster import Broadcaster
from backend.serial.manager import SerialManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("tpl-signum")

app = FastAPI()
state = SensorState()
broadcaster = Broadcaster()
serial_manager = SerialManager(state=state, forced_port=SERIAL_PORT)

frontend_dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"
deps = AppDeps(
    state=state,
    broadcaster=broadcaster,
    static_dir=str(frontend_dist),
    send_serial=serial_manager.send_serial,
)
register_routes(app, deps)


def _broadcast_snapshot() -> None:
    broadcaster.enqueue(snapshot(state))


def _on_serial_event(event: dict) -> None:
    if handle_event(state, event):
        _broadcast_snapshot()


def _on_serial_connected(port: str) -> None:
    set_connection_state(state, True, port, "clear")
    state.add_log(f"Connected to {port}")
    _broadcast_snapshot()


def _on_serial_idle() -> None:
    if check_auto_reset(state, time.time(), AUTO_RESET_TIMEOUT):
        _broadcast_snapshot()


def _on_serial_disconnect(reason: str | None) -> None:
    mark_disconnected(state, reason)
    _broadcast_snapshot()


def serial_reader_thread() -> None:
    serial_manager.serial_reader_loop(
        on_event=_on_serial_event,
        on_connected=_on_serial_connected,
        on_idle=_on_serial_idle,
        on_disconnect=_on_serial_disconnect,
    )


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(broadcaster.start())
    threading.Thread(target=serial_reader_thread, daemon=True).start()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
