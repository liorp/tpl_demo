import threading
from collections import deque
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


class _ScriptedSerial:
    """Minimal serial.Serial replacement driven by a deque of read responses."""

    def __init__(self, reads: deque[bytes]):
        self.is_open = True
        self.in_waiting = 0
        self.writes: list[str] = []
        self._reads = reads

    def read(self, _: int) -> bytes:
        if self._reads:
            return self._reads.popleft()
        raise serial.SerialException("scripted reads exhausted")

    def reset_input_buffer(self) -> None:
        return None

    def write(self, data: bytes) -> None:
        self.writes.append(data.decode())

    def close(self) -> None:
        self.is_open = False


def _attach_serial(monkeypatch, scripted: _ScriptedSerial, port: str) -> None:
    def _factory(*_args, **_kwargs):
        return scripted

    monkeypatch.setattr("backend.serial.manager.serial.Serial", _factory)
    monkeypatch.setattr("backend.serial.manager.list_serial_ports", lambda _forced: [port])
    monkeypatch.setattr("backend.serial.manager.time.sleep", lambda *_: None)


def test_handshake_sends_get_version_then_validates_on_reply(monkeypatch):
    port = "/dev/cu.usbmodem1101"
    scripted = _ScriptedSerial(
        deque([b"#GETVERSION:1.0b24\r\nOK\r\n", b""])
    )
    _attach_serial(monkeypatch, scripted, port)

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    assert "AT#GETVERSION?\r" in scripted.writes
    connected = [m for m in sink.messages if isinstance(m, SerialConnected)]
    assert connected and connected[0].port == port


def test_validation_times_out_when_no_at_response(monkeypatch):
    port = "/dev/cu.usbmodem1101"
    scripted = _ScriptedSerial(deque([b"hello from random serial\r\n", b"", b""]))
    _attach_serial(monkeypatch, scripted, port)

    monotonic_values = iter([0.0, 0.0, 0.0, 8.5])
    monkeypatch.setattr(
        "backend.serial.manager.time.monotonic",
        lambda: next(monotonic_values, 9.0),
    )

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    assert not any(isinstance(m, SerialConnected) for m in sink.messages)


def test_command_pacing_waits_for_ok_before_next_command(monkeypatch):
    port = "/dev/cu.usbmodem1101"
    scripted = _ScriptedSerial(
        deque(
            [
                b"#GETVERSION:1.0b24\r\nOK\r\n",  # validates handshake
                b"",                              # idle: drains first user cmd
                b"",                              # still awaiting ack
                b"OK\r\n",                        # ack first cmd
                b"",                              # idle: drains second user cmd
                b"OK\r\n",                        # ack second cmd
                b"",                              # exit
            ]
        )
    )
    _attach_serial(monkeypatch, scripted, port)

    manager = SerialManager(forced_port="")
    manager.send_serial("AT#REQMESHMAP=0")
    manager.send_serial("AT#PING=0")

    stop = threading.Event()
    sink = _StoppingSink(stop)

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    # First write is the handshake. Then exactly one queued command per OK gate.
    assert scripted.writes[0] == "AT#GETVERSION?\r"
    assert "AT#REQMESHMAP=0\r" in scripted.writes
    assert "AT#PING=0\r" in scripted.writes
    # The second user command must arrive after the OK that ack'd the first.
    first_idx = scripted.writes.index("AT#REQMESHMAP=0\r")
    second_idx = scripted.writes.index("AT#PING=0\r")
    assert second_idx > first_idx


def test_at_event_lines_are_forwarded_to_sink(monkeypatch):
    port = "/dev/cu.usbmodem1101"
    scripted = _ScriptedSerial(
        deque(
            [
                b"#GETVERSION:1.0b24\r\nOK\r\n",
                b"#EVTDETECT=11,12,555,500\r\n",
                b"",
            ]
        )
    )
    _attach_serial(monkeypatch, scripted, port)

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    detection = [
        m for m in sink.messages
        if isinstance(m, SerialEvent) and m.event["type"] == "detection"
    ]
    assert detection
    assert detection[0].event["unit_a"] == 11
    assert detection[0].event["unit_b"] == 12


def test_disconnects_when_port_disappears(monkeypatch):
    port = "/dev/cu.usbmodem1101"
    scripted = _ScriptedSerial(deque([b"#GETVERSION:1.0b24\r\nOK\r\n", b""]))
    monkeypatch.setattr(
        "backend.serial.manager.serial.Serial",
        lambda *_a, **_k: scripted,
    )
    monkeypatch.setattr("backend.serial.manager.time.sleep", lambda *_: None)

    port_list_calls = {"count": 0}

    def fake_list(_forced: str) -> list[str]:
        port_list_calls["count"] += 1
        return [port] if port_list_calls["count"] == 1 else []

    monkeypatch.setattr("backend.serial.manager.list_serial_ports", fake_list)

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)
    manager.serial_reader_loop(sink=sink, stop_event=stop)

    assert any(isinstance(m, SerialDisconnect) for m in sink.messages)


def test_at_cmd_ready_token_queues_a_map_refresh(monkeypatch):
    port = "/dev/cu.usbmodem1101"
    scripted = _ScriptedSerial(
        deque([b"#GETVERSION:1.0b24\r\nOK\r\nATCMD_CLI_READY\r\n", b"OK\r\n", b""])
    )
    _attach_serial(monkeypatch, scripted, port)

    manager = SerialManager(forced_port="")
    stop = threading.Event()
    sink = _StoppingSink(stop)

    manager.serial_reader_loop(sink=sink, stop_event=stop)

    assert "AT#REQMESHMAP=0\r" in scripted.writes
