from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
TAG_RE = re.compile(r"^#([A-Z0-9]+)\s*[=:]\s*(.*)$")
QUOTED_RE = re.compile(r'^"(.*)"$')


@dataclass(frozen=True)
class ControlFrame:
    type: Literal["ok", "error", "ready"]


ParseResult = dict[str, Any] | ControlFrame | None


def _strip(line: str) -> str:
    return ANSI_RE.sub("", line).strip()


def _split_fields(payload: str) -> list[str]:
    return [field.strip() for field in payload.split(",")]


def _unquote(value: str) -> str:
    match = QUOTED_RE.match(value)
    return match.group(1) if match else value


def _to_int(value: str) -> int | None:
    try:
        return int(value)
    except ValueError:
        return None


def _expect_ints(fields: list[str], n: int) -> list[int] | None:
    if len(fields) < n:
        return None
    parsed = [_to_int(field) for field in fields[:n]]
    if any(v is None for v in parsed):
        return None
    return parsed  # type: ignore[return-value]


def _parse_detect(fields: list[str]) -> dict[str, Any] | None:
    values = _expect_ints(fields, 4)
    if values is None:
        return None
    unit_a, unit_b, value, threshold = values
    return {
        "type": "detection",
        "unit_a": unit_a,
        "unit_b": unit_b,
        "value": value,
        "threshold": threshold,
    }


def _parse_detection_comm(fields: list[str]) -> dict[str, Any] | None:
    values = _expect_ints(fields, 4)
    if values is None:
        return None
    unit_a, unit_b, no_comm_ms, no_comm_threshold = values
    return {
        "type": "comm_loss",
        "unit_a": unit_a,
        "unit_b": unit_b,
        "no_comm_ms": no_comm_ms,
        "no_comm_threshold": no_comm_threshold,
    }


def _parse_link_up(fields: list[str]) -> dict[str, Any] | None:
    values = _expect_ints(fields, 5)
    if values is None:
        return None
    reporting_unit, linked_unit, rssi, threshold_cfg, gain_cfg = values
    return {
        "type": "link_up",
        "reporting_unit": reporting_unit,
        "linked_unit": linked_unit,
        "rssi": rssi,
        "threshold_cfg": threshold_cfg,
        "gain_cfg": gain_cfg,
    }


def _parse_link_down(fields: list[str]) -> dict[str, Any] | None:
    values = _expect_ints(fields, 4)
    if values is None:
        return None
    reporting_unit, linked_unit, last_rssi, reason = values
    return {
        "type": "link_down",
        "reporting_unit": reporting_unit,
        "linked_unit": linked_unit,
        "last_rssi": last_rssi,
        "reason": reason,
    }


def _parse_map_dev(fields: list[str]) -> dict[str, Any] | None:
    if len(fields) < 3:
        return None
    unit_id = _to_int(fields[0])
    voltage = _to_int(fields[2])
    if unit_id is None or voltage is None:
        return None
    return {
        "type": "map_dev",
        "unit_id": unit_id,
        "version": _unquote(fields[1]),
        "voltage": voltage,
    }


def _parse_map_link(fields: list[str]) -> dict[str, Any] | None:
    values = _expect_ints(fields, 5)
    if values is None:
        return None
    reporting_unit, linked_unit, rssi, threshold, gain = values
    return {
        "type": "map_link",
        "reporting_unit": reporting_unit,
        "linked_unit": linked_unit,
        "rssi": rssi,
        "threshold": threshold,
        "gain": gain,
    }


def _parse_error(fields: list[str]) -> dict[str, Any] | None:
    if len(fields) < 2:
        return None
    error_number = _to_int(fields[0])
    if error_number is None:
        return None
    return {
        "type": "error",
        "error_number": error_number,
        "error_text": ",".join(fields[1:]).strip(),
    }


def _parse_trace(fields: list[str]) -> dict[str, Any] | None:
    text = ",".join(fields).strip()
    if not text:
        return None
    return {"type": "trace", "text": text}


def _parse_antenna(fields: list[str]) -> dict[str, Any] | None:
    values = _expect_ints(fields, 3)
    if values is None:
        return None
    unit, active_antenna, supported_antennas = values
    return {
        "type": "antenna",
        "unit": unit,
        "active_antenna": active_antenna,
        "supported_antennas": supported_antennas,
    }


def _parse_detection_mode(fields: list[str]) -> dict[str, Any] | None:
    if not fields:
        return None
    mode = _to_int(fields[0])
    if mode is None:
        return None
    return {
        "type": "detection_mode",
        "mode": mode,
        "internal_data": fields[1] if len(fields) > 1 else "",
    }


def _parse_ping_response(fields: list[str]) -> dict[str, Any] | None:
    values = _expect_ints(fields, 2)
    if values is None:
        return None
    unit, round_trip_ms = values
    return {"type": "ping_response", "unit": unit, "round_trip_ms": round_trip_ms}


def _parse_version(fields: list[str]) -> dict[str, Any] | None:
    text = ",".join(fields).strip()
    if not text:
        return None
    return {"type": "version", "version": _unquote(text)}


_TAG_HANDLERS = {
    "EVTDETECT": _parse_detect,
    "EVTDETCOM": _parse_detection_comm,
    "EVTMESHLINKUP": _parse_link_up,
    "EVTMESHLINKDOWN": _parse_link_down,
    "EVTMESHMAPDEV": _parse_map_dev,
    "EVTMESHMAPDEVLINK": _parse_map_link,
    "EVTERR": _parse_error,
    "EVTTRACE": _parse_trace,
    "EVTACTANT": _parse_antenna,
    "EVTDETMODE": _parse_detection_mode,
    "PINGRSP": _parse_ping_response,
    "GETVERSION": _parse_version,
}


def parse_line(raw_line: str) -> ParseResult:
    line = _strip(raw_line)
    if not line:
        return None

    if line == "OK":
        return ControlFrame(type="ok")
    if line == "ERROR":
        return ControlFrame(type="error")
    if line == "ATCMD_CLI_READY":
        return ControlFrame(type="ready")

    match = TAG_RE.match(line)
    if not match:
        return None

    tag = match.group(1)
    payload = match.group(2)
    handler = _TAG_HANDLERS.get(tag)
    if handler is None:
        return None
    return handler(_split_fields(payload))
