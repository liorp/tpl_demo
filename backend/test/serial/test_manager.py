import threading
from types import SimpleNamespace

from backend.core.events import SerialConnected, SerialDisconnect, SerialEvent
from backend.serial.manager import SerialManager, list_serial_ports

import serial


class _StoppingSink:
    """Sink wrapper that collects messages and sets a stop event on disconnect."""

    def __init__(self, stop: threading.Event):
        self.messages: list = []
        self._stop = stop

    def put_nowait(self, msg):
        self.messages.append(msg)
        if isinstance(msg, SerialDisconnect):
            self._stop.set()


def test_filters_out_bluetooth_incoming_port(monkeypatch):
    monkeypatch.setattr(
        "serial.tools.list_ports.comports",
        lambda: [
            SimpleNamespace(device="/dev/cu.Bluetooth-Incoming-Port"),
            SimpleNamespace(device="/dev/cu.usbmodem1101"),
        ],
    )

    assert list_serial_ports("") == ["/dev/cu.usbmodem1101"]


def test_prioritizes_usb_style_ports_over_other_ports(monkeypatch):
    monkeypatch.setattr(
        "serial.tools.list_ports.comports",
        lambda: [
            SimpleNamespace(device="/dev/cu.Bluetooth-Incoming-Port"),
            SimpleNamespace(device="/dev/cu.usbmodem1101"),
            SimpleNamespace(device="/dev/ttyACM0"),
            SimpleNamespace(device="/dev/tty.debug-console"),
        ],
    )

    assert list_serial_ports("") == ["/dev/cu.usbmodem1101", "/dev/ttyACM0"]


def test_ignores_non_usb_ports_when_no_usb_candidates_exist(monkeypatch):
    monkeypatch.setattr(
        "serial.tools.list_ports.comports",
        lambda: [
            SimpleNamespace(device="/dev/cu.debug-console"),
            SimpleNamespace(device="/dev/tty.debug-console"),
            SimpleNamespace(device="/dev/cu.Bluetooth-Incoming-Port"),
        ],
    )

    assert list_serial_ports("") == []


def test_queues_commands_until_connection_is_open(monkeypatch):
    writes: list[str] = []

    class FakeSerial:
        def __init__(self, *args, **kwargs):
            self.is_open = True

        def write(self, data):
            writes.append(data.decode())

    manager = SerialManager(forced_port="")
    manager.send_serial("threshold 500")
    manager.send_serial("gain 64")

    monkeypatch.setattr("backend.serial.manager.serial.Serial", FakeSerial)
    manager._connect("/dev/cu.usbmodem1101")

    assert writes == ["threshold 500\r", "gain 64\r"]


def test_disconnects_immediately_when_port_disappears_during_idle(monkeypatch):
    port = "/dev/cu.usbmodem1101"

    class FakeSerial:
        read_calls = 0

        def __init__(self, *args, **kwargs):
            self.in_waiting = 0
            self.is_open = True

        def read(self, _):
            FakeSerial.read_calls += 1
            if FakeSerial.read_calls == 1:
                return b""
            raise serial.SerialException("should not need a second read")

        def reset_input_buffer(self):
            return None

        def write(self, _):
            return None

        def close(self):
            self.is_open = False

    port_list_calls = {"count": 0}

    def fake_list_serial_ports(_forced_port: str):
        port_list_calls["count"] += 1
        if port_list_calls["count"] == 1:
            return [port]
        return []

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    monkeypatch.setattr("backend.serial.manager.serial.Serial", FakeSerial)
    monkeypatch.setattr("backend.serial.manager.list_serial_ports", fake_list_serial_ports)
    monkeypatch.setattr("backend.serial.manager.time.sleep", lambda *_: None)

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    assert FakeSerial.read_calls == 1
    assert port_list_calls["count"] >= 2
    assert any(isinstance(m, SerialDisconnect) for m in sink.messages)


def test_rejects_port_without_valid_protocol_event(monkeypatch):
    port = "/dev/cu.usbmodem1101"

    class FakeSerial:
        read_calls = 0

        def __init__(self, *args, **kwargs):
            self.in_waiting = 0
            self.is_open = True

        def read(self, _):
            FakeSerial.read_calls += 1
            if FakeSerial.read_calls == 1:
                return b"hello from random serial device\n"
            return b""

        def reset_input_buffer(self):
            return None

        def write(self, _):
            return None

        def close(self):
            self.is_open = False

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    monotonic_values = iter([0.0, 8.0])
    monkeypatch.setattr("backend.serial.manager.serial.Serial", FakeSerial)
    monkeypatch.setattr("backend.serial.manager.list_serial_ports", lambda _forced: [port])
    monkeypatch.setattr("backend.serial.manager.time.sleep", lambda *_: None)
    monkeypatch.setattr(
        "backend.serial.manager.time.monotonic", lambda: next(monotonic_values, 5.0)
    )

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    assert not any(isinstance(m, SerialConnected) for m in sink.messages)


def test_marks_connected_after_first_valid_protocol_event(monkeypatch):
    port = "/dev/cu.usbmodem1101"

    class FakeSerial:
        read_calls = 0

        def __init__(self, *args, **kwargs):
            self.in_waiting = 0
            self.is_open = True

        def read(self, _):
            FakeSerial.read_calls += 1
            if FakeSerial.read_calls == 1:
                return b"[123] I CMD:CONFIG threshold:777 val:799\n"
            raise serial.SerialException("done")

        def reset_input_buffer(self):
            return None

        def write(self, _):
            return None

        def close(self):
            self.is_open = False

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    monkeypatch.setattr("backend.serial.manager.serial.Serial", FakeSerial)
    monkeypatch.setattr("backend.serial.manager.list_serial_ports", lambda _forced: [port])
    monkeypatch.setattr("backend.serial.manager.time.sleep", lambda *_: None)

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    connected_ports = [m.port for m in sink.messages if isinstance(m, SerialConnected)]
    assert connected_ports == [port]
    assert any(isinstance(m, SerialEvent) for m in sink.messages)


def test_sends_map_heartbeat_even_when_data_flows_continuously(monkeypatch):
    """MAP heartbeat must fire during continuous data, not only during idle."""
    port = "/dev/cu.usbmodem1101"
    written_commands: list[str] = []

    class FakeSerial:
        read_calls = 0

        def __init__(self, *args, **kwargs):
            self.in_waiting = 0
            self.is_open = True

        def read(self, _):
            FakeSerial.read_calls += 1
            # First read: valid protocol event (triggers validation)
            if FakeSerial.read_calls == 1:
                return b"[100] I CMD:CONFIG threshold:10 val:20\n"
            # Reads 2-4: continuous non-MAP data (no idle gap)
            if FakeSerial.read_calls <= 4:
                return b"[101] I CMD:CONNECTED ABC(7) connected:DEF(8) 1\n"
            # Stop after enough reads
            raise serial.SerialException("done")

        def reset_input_buffer(self):
            return None

        def write(self, data):
            written_commands.append(data.decode())

        def close(self):
            self.is_open = False

    # Time progression: start at 0, then jump past heartbeat interval
    time_values = iter([
        0.0,   # validation_started_at / last_map_time
        0.0,   # first read timestamp check (protocol validation)
        4.0,   # second read - past 3s heartbeat interval
        4.0,   # third read
        4.0,   # fourth read
        4.0,   # fifth read (raises)
    ])

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    monkeypatch.setattr("backend.serial.manager.serial.Serial", FakeSerial)
    monkeypatch.setattr("backend.serial.manager.list_serial_ports", lambda _forced: [port])
    monkeypatch.setattr("backend.serial.manager.time.sleep", lambda *_: None)
    monkeypatch.setattr(
        "backend.serial.manager.time.monotonic", lambda: next(time_values, 10.0)
    )

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    # The initial setup sends: /, cmd, re 3 4, /, mpedT, map
    # After heartbeat interval elapses during data flow, another "map" should be sent
    map_commands = [cmd for cmd in written_commands if cmd.strip() == "map\r" or cmd == "map\r"]
    assert len(map_commands) >= 2, (
        f"Expected at least 2 map commands (initial + heartbeat), "
        f"got {len(map_commands)}. All commands: {written_commands}"
    )
