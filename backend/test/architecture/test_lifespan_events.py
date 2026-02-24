from backend.core.events import SerialConnected, SerialDisconnect
from backend.main import _handle_serial_message, app, logger, state


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
    prev_alarm = state.alarm_state
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
    state.alarm_state = prev_alarm
    state.logs = prev_logs


def test_handle_serial_message_disconnect_marks_disconnected_and_logs_warning(monkeypatch):
    warnings: list[str] = []
    queued_payloads: list[dict] = []
    prev_connected = state.serial_connected
    prev_port = state.current_port
    prev_alarm = state.alarm_state
    prev_logs = list(state.logs)

    monkeypatch.setattr("backend.main.logger.warning", lambda message, *args: warnings.append(
        message % args if args else message
    ))
    monkeypatch.setattr("backend.main.broadcaster.enqueue", queued_payloads.append)
    monkeypatch.setattr("backend.main.serial_manager.close_connection", lambda: None)

    _handle_serial_message(SerialDisconnect("Disconnected from COM7"))

    assert state.serial_connected is False
    assert state.current_port == "None"
    assert state.alarm_state == "disconnected"
    assert state.logs[0]["msg"] == "Disconnected from COM7"
    assert warnings == ["Disconnected from COM7"]
    assert queued_payloads

    state.serial_connected = prev_connected
    state.current_port = prev_port
    state.alarm_state = prev_alarm
    state.logs = prev_logs
