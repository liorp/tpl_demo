import asyncio
import contextlib

from backend.core.events import SerialConnected, SerialDisconnect, SerialIdle
from backend.main import (
    _handle_serial_message,
    _serial_consumer,
    app,
    logger,
    state,
)


def test_app_uses_lifespan_instead_of_on_event_hooks():
    assert len(app.router.on_startup) == 0
    assert len(app.router.on_shutdown) == 0


def test_app_logger_has_stream_and_rotating_file_handlers():
    handler_types = {type(h).__name__ for h in logger.handlers}
    assert "StreamHandler" in handler_types
    assert "RotatingFileHandler" in handler_types


def test_handle_serial_message_connected_updates_state_and_event_log(monkeypatch):
    called: list[str] = []
    queued_payloads: list[dict] = []
    prev_connected = state.serial_connected
    prev_port = state.current_port
    prev_logs = list(state.logs)

    def fake_log_event(state_obj, logger_obj, message, level="info", fields=None):
        called.append(message)
        state_obj.add_log(message, fields=fields)

    monkeypatch.setattr("backend.main.log_event", fake_log_event)
    monkeypatch.setattr("backend.main.broadcaster.enqueue", queued_payloads.append)

    _handle_serial_message(SerialConnected("COM7"))

    assert state.serial_connected is True
    assert state.current_port == "COM7"
    assert called == ["Connected to COM7"]
    assert queued_payloads

    state.serial_connected = prev_connected
    state.current_port = prev_port
    state.logs = prev_logs


def test_handle_serial_message_disconnect_marks_disconnected_and_logs_warning(monkeypatch):
    warnings: list[str] = []
    queued_payloads: list[dict] = []
    prev_connected = state.serial_connected
    prev_port = state.current_port
    prev_logs = list(state.logs)

    monkeypatch.setattr("backend.main.logger.warning", lambda message, *args: warnings.append(
        message % args if args else message
    ))
    monkeypatch.setattr("backend.main.broadcaster.enqueue", queued_payloads.append)
    monkeypatch.setattr("backend.main.serial_manager.close_connection", lambda: None)

    _handle_serial_message(SerialDisconnect("Disconnected from COM7"))

    assert state.serial_connected is False
    assert state.current_port == "None"
    assert state.logs[0]["msg"] == "Disconnected from COM7"
    assert warnings == ["Disconnected from COM7"]
    assert queued_payloads

    state.serial_connected = prev_connected
    state.current_port = prev_port
    state.logs = prev_logs


def test_serial_consumer_continues_processing_after_handler_exception(monkeypatch):
    handled: list[str] = []

    def fake_handle(_msg):
        handled.append("msg")
        if len(handled) == 1:
            raise RuntimeError("boom")

    monkeypatch.setattr("backend.main._handle_serial_message", fake_handle)
    exceptions: list[str] = []
    monkeypatch.setattr(
        "backend.main.logger.exception",
        lambda message, *args: exceptions.append(message % args if args else message),
    )

    async def run():
        queue: asyncio.Queue = asyncio.Queue()
        task = asyncio.create_task(_serial_consumer(queue))
        queue.put_nowait(SerialIdle())
        queue.put_nowait(SerialIdle())
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert handled == ["msg", "msg"]
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert exceptions
