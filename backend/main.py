import asyncio
import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from backend.api.routes import AppDeps, register_routes
from backend.config import AUTO_RESET_TIMEOUT, LAYOUT_STATE_PATH, SERIAL_PORT
from backend.core.events import (
    SerialConnected,
    SerialDisconnect,
    SerialEvent,
    SerialIdle,
    SerialMessage,
)
from backend.core.layout_store import load_layout_state, save_layout_state
from backend.core.models import SensorState, snapshot
from backend.core.service import (
    check_auto_reset,
    handle_event,
    mark_disconnected,
    set_connection_state,
)
from backend.realtime.broadcaster import Broadcaster
from backend.serial.manager import SerialManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("tpl-signum")

state = SensorState()
broadcaster = Broadcaster()
serial_manager = SerialManager(forced_port=SERIAL_PORT)
layout_state_path = (
    Path(LAYOUT_STATE_PATH).expanduser()
    if LAYOUT_STATE_PATH
    else Path(__file__).resolve().parent / "data" / "layout_state.json"
)

frontend_dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"
tiles_dir = Path(__file__).resolve().parents[1] / "frontend" / "public" / "tiles"
deps = AppDeps(
    state=state,
    broadcaster=broadcaster,
    static_dir=str(frontend_dist),
    tiles_dir=str(tiles_dir),
    send_serial=serial_manager.send_serial,
    layout_state_path=layout_state_path,
    save_layout=save_layout_state,
)


class _AsyncSink:
    """Bridges the sync serial thread to an async queue via call_soon_threadsafe."""

    def __init__(self, queue: asyncio.Queue[SerialMessage], loop: asyncio.AbstractEventLoop):
        self._queue = queue
        self._loop = loop

    def put_nowait(self, msg: SerialMessage) -> None:
        self._loop.call_soon_threadsafe(self._queue.put_nowait, msg)


async def _serial_consumer(queue: asyncio.Queue[SerialMessage]) -> None:
    while True:
        msg = await queue.get()
        if isinstance(msg, SerialEvent):
            if handle_event(state, msg.event):
                broadcaster.enqueue(snapshot(state))
        elif isinstance(msg, SerialConnected):
            set_connection_state(state, True, msg.port, "clear")
            state.add_log(f"Connected to {msg.port}")
            broadcaster.enqueue(snapshot(state))
        elif isinstance(msg, SerialIdle):
            if check_auto_reset(state, time.time(), AUTO_RESET_TIMEOUT):
                broadcaster.enqueue(snapshot(state))
        elif isinstance(msg, SerialDisconnect):
            serial_manager.close_connection()
            mark_disconnected(state, msg.reason)
            broadcaster.enqueue(snapshot(state))


@asynccontextmanager
async def lifespan(_: FastAPI):
    persisted = load_layout_state(layout_state_path)
    state.units = persisted["units"]
    state.map_policy = persisted["map_policy"]
    asyncio.create_task(broadcaster.start())

    queue: asyncio.Queue[SerialMessage] = asyncio.Queue()
    loop = asyncio.get_running_loop()
    sink = _AsyncSink(queue, loop)
    asyncio.create_task(_serial_consumer(queue))
    threading.Thread(
        target=serial_manager.serial_reader_loop, args=(sink,), daemon=True
    ).start()
    yield


app = FastAPI(lifespan=lifespan)
register_routes(app, deps)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
