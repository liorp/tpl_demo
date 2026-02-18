import logging
import re
import time
from typing import Callable

import serial
import serial.tools.list_ports

from backend.config import BAUD_RATE
from backend.core.models import Event, SensorState
from backend.parsing.parser import parse_line

logger = logging.getLogger("tpl-signum")


def list_serial_ports(forced_port: str) -> list[str]:
    if forced_port:
        return [forced_port]

    ports = [p.device for p in serial.tools.list_ports.comports()]
    non_bluetooth = [p for p in ports if "bluetooth" not in p.lower()]

    preferred: list[str] = []
    for port in non_bluetooth:
        normalized = port.lower()
        basename = normalized.rsplit("/", 1)[-1]
        if (
            "usb" in normalized
            or "acm" in normalized
            or "ttyusb" in normalized
            or re.match(r"^com\d+$", basename)
        ):
            preferred.append(port)

    return preferred


class SerialManager:
    def __init__(self, state: SensorState, forced_port: str):
        self.state = state
        self.forced_port = forced_port

    def send_serial(self, cmd: str):
        with self.state.serial_lock:
            if self.state.serial_conn and self.state.serial_conn.is_open:
                self.state.serial_conn.write((cmd + "\r").encode())

    def _connect(self, port: str) -> serial.Serial:
        ser = serial.Serial(
            port,
            BAUD_RATE,
            timeout=1,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            xonxoff=False,
            rtscts=False,
        )
        with self.state.serial_lock:
            self.state.serial_conn = ser
        return ser

    def _is_port_available(self, port: str) -> bool:
        if self.forced_port:
            ports = [entry.device for entry in serial.tools.list_ports.comports()]
            return port in ports
        return port in list_serial_ports(self.forced_port)

    def serial_reader_loop(
        self,
        on_event: Callable[[Event], None],
        on_connected: Callable[[str], None],
        on_idle: Callable[[], None],
        on_disconnect: Callable[[str | None], None],
    ) -> None:
        while True:
            ports = list_serial_ports(self.forced_port)
            if not ports:
                on_disconnect("No serial ports found")
                time.sleep(2)
                continue

            connected_any = False
            for port in ports:
                try:
                    self.state.add_log(f"Trying port: {port}")
                    ser = self._connect(port)
                    connected_any = True

                    on_connected(port)
                    time.sleep(0.5)
                    ser.reset_input_buffer()
                    self.send_serial("/")
                    time.sleep(0.2)
                    self.send_serial("cmd")
                    time.sleep(0.2)
                    self.send_serial("re 3 4")

                    buffer = ""
                    while True:
                        data = ser.read(ser.in_waiting or 1)
                        if not data:
                            if not self._is_port_available(port):
                                break
                            on_idle()
                            continue

                        buffer += data.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            event = parse_line(line)
                            if event:
                                on_event(event)
                except serial.SerialException:
                    continue
                except Exception as exc:
                    logger.warning("Serial loop error on %s: %s", port, exc)
                finally:
                    on_disconnect(f"Disconnected from {port}")

            if not connected_any:
                on_disconnect(None)
                time.sleep(2)
