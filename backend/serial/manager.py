from __future__ import annotations

import contextlib
import logging
import os
import re
import threading
import time
from collections import deque
from typing import Any

import serial.tools.list_ports

import serial
from backend.config import BAUD_RATE
from backend.core.events import (
    MessageSink,
    SerialConnected,
    SerialDisconnect,
    SerialEvent,
    SerialIdle,
)
from backend.parsing.encoder import format_ping, format_request_map
from backend.parsing.parser import ControlFrame, parse_line
from backend.serial.boot_defaults import detection_mode_command, link_default_commands

logger = logging.getLogger("tpl-signum")
PROTOCOL_VALIDATION_TIMEOUT_SEC = 8.0
PING_HEARTBEAT_INTERVAL_SEC = 10.0
COMMAND_ACK_TIMEOUT_SEC = 2.0
_PROTOCOL_VALIDATING_EVENT_TYPES = frozenset(
    {"ping_response", "map_dev", "map_link", "detection", "link_up"}
)


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
    def __init__(self, forced_port: str):
        self.forced_port = forced_port
        self._serial_lock = threading.Lock()
        self._serial_conn: serial.Serial | None = None
        self._pending_commands: deque[str] = deque()
        self._configured_pairs: set[tuple[int, int]] = set()

    def send_serial(self, cmd: str) -> None:
        with self._serial_lock:
            self._pending_commands.append(cmd)

    def _enqueue(self, *commands: str) -> None:
        if not commands:
            return
        with self._serial_lock:
            self._pending_commands.extend(commands)

    def close_connection(self) -> None:
        with self._serial_lock:
            if self._serial_conn:
                with contextlib.suppress(Exception):
                    self._serial_conn.close()
                self._serial_conn = None

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
        with self._serial_lock:
            self._serial_conn = ser
        return ser

    def _is_port_available(self, port: str) -> bool:
        if self.forced_port:
            return os.path.exists(port)
        return port in list_serial_ports(self.forced_port)

    def _write_command(self, ser: serial.Serial, cmd: str) -> None:
        ser.write((cmd + "\r").encode())

    def _drain_one_pending(
        self, ser: serial.Serial, *, awaiting_ack: bool
    ) -> tuple[bool, float | None]:
        """Send one queued command if pacing allows. Returns (now_awaiting, sent_at)."""
        if awaiting_ack:
            return True, None
        with self._serial_lock:
            if not self._pending_commands:
                return False, None
            cmd = self._pending_commands.popleft()
        self._write_command(ser, cmd)
        return True, time.monotonic()

    def serial_reader_loop(
        self,
        sink: MessageSink,
        stop_event: threading.Event | None = None,
    ) -> None:
        while not (stop_event and stop_event.is_set()):
            ports = list_serial_ports(self.forced_port)
            if not ports:
                sink.put_nowait(SerialDisconnect("No serial ports found"))
                time.sleep(2)
                continue

            connected_any = False
            for port in ports:
                try:
                    logger.info("Trying port: %s", port)
                    ser = self._connect(port)
                    connected_any = True
                    self._handle_port_session(ser, port, sink, stop_event)
                except serial.SerialException:
                    continue
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Serial loop error on %s: %s", port, exc)
                finally:
                    sink.put_nowait(SerialDisconnect(f"Disconnected from {port}"))

            if not connected_any:
                sink.put_nowait(SerialDisconnect(None))
                time.sleep(2)

    def _handle_port_session(
        self,
        ser: serial.Serial,
        port: str,
        sink: MessageSink,
        stop_event: threading.Event | None,
    ) -> None:
        time.sleep(0.5)
        ser.reset_input_buffer()

        self._configured_pairs = set()
        with self._serial_lock:
            self._pending_commands.appendleft(format_ping(0))

        validated_protocol = False
        validation_started_at = time.monotonic()
        last_ping_time = validation_started_at
        awaiting_ack = False
        ack_sent_at: float | None = None
        buffer = ""

        while not (stop_event and stop_event.is_set()):
            data = ser.read(ser.in_waiting or 1)

            if data:
                buffer += data.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    awaiting_ack, validated_protocol = self._consume_line(
                        line=line,
                        sink=sink,
                        port=port,
                        awaiting_ack=awaiting_ack,
                        validated_protocol=validated_protocol,
                    )

            if not data and not self._is_port_available(port):
                break

            if (
                not validated_protocol
                and time.monotonic() - validation_started_at
                >= PROTOCOL_VALIDATION_TIMEOUT_SEC
            ):
                logger.info("Ignoring %s: no valid protocol events", port)
                break

            now = time.monotonic()
            if (
                awaiting_ack
                and ack_sent_at is not None
                and now - ack_sent_at >= COMMAND_ACK_TIMEOUT_SEC
            ):
                logger.warning("AT command ack timed out, releasing pacing lock")
                awaiting_ack = False
                ack_sent_at = None

            if (
                validated_protocol
                and now - last_ping_time >= PING_HEARTBEAT_INTERVAL_SEC
            ):
                with self._serial_lock:
                    self._pending_commands.append(format_ping(0))
                last_ping_time = now

            now_awaiting, sent_at = self._drain_one_pending(
                ser, awaiting_ack=awaiting_ack
            )
            if not awaiting_ack and now_awaiting:
                ack_sent_at = sent_at
            awaiting_ack = now_awaiting

            if not data:
                sink.put_nowait(SerialIdle())

    def _consume_line(
        self,
        *,
        line: str,
        sink: MessageSink,
        port: str,
        awaiting_ack: bool,
        validated_protocol: bool,
    ) -> tuple[bool, bool]:
        result = parse_line(line)
        if result is None:
            return awaiting_ack, validated_protocol
        if isinstance(result, ControlFrame):
            if result.type in ("ok", "error"):
                awaiting_ack = False
            elif result.type == "ready":
                logger.info("Device READY token received")
                with self._serial_lock:
                    self._pending_commands.append(format_request_map(0))
            return awaiting_ack, validated_protocol

        event: dict[str, Any] = result
        event_type = event.get("type")
        if not validated_protocol and event_type in _PROTOCOL_VALIDATING_EVENT_TYPES:
            validated_protocol = True
            sink.put_nowait(SerialConnected(port))
            self._enqueue(detection_mode_command())
        if event_type == "map_link":
            self._enqueue(*link_default_commands(event, self._configured_pairs))
        if event_type == "version":
            return awaiting_ack, validated_protocol
        sink.put_nowait(SerialEvent(event))
        return awaiting_ack, validated_protocol
