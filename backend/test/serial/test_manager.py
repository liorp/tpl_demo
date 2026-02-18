from types import SimpleNamespace

import pytest
import serial

from backend.core.models import SensorState
from backend.serial.manager import SerialManager, list_serial_ports


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

    class StopLoop(Exception):
        pass

    manager = SerialManager(state=SensorState(), forced_port="")

    monkeypatch.setattr("backend.serial.manager.serial.Serial", FakeSerial)
    monkeypatch.setattr("backend.serial.manager.list_serial_ports", fake_list_serial_ports)
    monkeypatch.setattr("backend.serial.manager.time.sleep", lambda *_: None)

    def on_disconnect(_reason: str | None):
        raise StopLoop()

    with pytest.raises(StopLoop):
        manager.serial_reader_loop(
            on_event=lambda _event: None,
            on_connected=lambda _port: None,
            on_idle=lambda: None,
            on_disconnect=on_disconnect,
        )

    assert FakeSerial.read_calls == 1
    assert port_list_calls["count"] >= 2
