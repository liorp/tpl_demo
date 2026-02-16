from types import SimpleNamespace

from backend.serial.manager import list_serial_ports


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
