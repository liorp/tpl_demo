import asyncio
import threading
from contextlib import suppress

import backend.main as main_module
from fastapi import FastAPI


def test_lifespan_stops_thread_and_cancels_background_tasks(monkeypatch):
    created_threads: list[object] = []
    closed: list[str] = []

    class FakeThread:
        def __init__(self, target, args=(), daemon=None):
            self.target = target
            self.args = args
            self.daemon = daemon
            self.started = False
            self.join_called = False
            created_threads.append(self)

        def start(self):
            self.started = True

        def join(self, timeout=None):
            self.join_called = True

    async def wait_forever():
        await asyncio.Event().wait()

    monkeypatch.setattr(main_module.threading, "Thread", FakeThread)
    monkeypatch.setattr(
        main_module.serial_manager,
        "serial_reader_loop",
        lambda sink, stop_event=None: None,
    )
    monkeypatch.setattr(
        main_module.serial_manager,
        "close_connection",
        lambda: closed.append("closed"),
    )
    monkeypatch.setattr(main_module.broadcaster, "start", wait_forever)
    monkeypatch.setattr(main_module, "_serial_consumer", lambda _queue: wait_forever())
    monkeypatch.setattr(
        main_module,
        "load_layout_state",
        lambda _path: {"units": [], "map_policy": dict(main_module.state.map_policy)},
    )

    async def run_case():
        created_tasks: list[asyncio.Task] = []
        original_create_task = asyncio.create_task

        def tracking_create_task(coro):
            task = original_create_task(coro)
            created_tasks.append(task)
            return task

        monkeypatch.setattr(main_module.asyncio, "create_task", tracking_create_task)
        cm = main_module.lifespan(FastAPI())
        await cm.__aenter__()
        thread = created_threads[0]
        stop_event = thread.args[1] if len(thread.args) > 1 else None
        await cm.__aexit__(None, None, None)
        cancelled_before_cleanup = [task.cancelled() for task in created_tasks]

        for task in created_tasks:
            if not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

        return stop_event, cancelled_before_cleanup, thread.join_called

    stop_event, cancelled, thread_join_called = asyncio.run(run_case())

    assert isinstance(stop_event, threading.Event)
    assert stop_event.is_set()
    assert thread_join_called is True
    assert closed == ["closed"]
    assert cancelled and all(cancelled)
