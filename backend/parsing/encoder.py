from __future__ import annotations

THRESHOLD_MAX = 65534
ANTENNA_INTERNAL = 1
ANTENNA_EXTERNAL = 2
SUPPORTED_ANTENNAS = {ANTENNA_INTERNAL, ANTENNA_EXTERNAL}
SUPPORTED_DETECTION_MODES = {1, 2}


def _require_unit(unit: int) -> int:
    if not isinstance(unit, int) or unit < 0:
        raise ValueError(f"unit must be a non-negative int, got {unit!r}")
    return unit


def _require_threshold(value: int) -> int:
    if not isinstance(value, int) or value < 0 or value > THRESHOLD_MAX:
        raise ValueError(f"threshold must be 0..{THRESHOLD_MAX}, got {value!r}")
    return value


def _require_gain(value: int) -> int:
    if not isinstance(value, int) or value < 0:
        raise ValueError(f"gain must be a non-negative int, got {value!r}")
    return value


def format_set_threshold(unit_a: int, unit_b: int, value: int) -> str:
    return (
        f"AT#SETDETTHR={_require_unit(unit_a)},{_require_unit(unit_b)},"
        f"{_require_threshold(value)}"
    )


def format_set_gain(unit_a: int, unit_b: int, value: int) -> str:
    return (
        f"AT#SETDETGAIN={_require_unit(unit_a)},{_require_unit(unit_b)},"
        f"{_require_gain(value)}"
    )


def format_request_map(unit: int = 0) -> str:
    return f"AT#REQMESHMAP={_require_unit(unit)}"


def format_ping(unit: int = 0) -> str:
    return f"AT#PING={_require_unit(unit)}"


def format_set_active_antenna(unit: int, antenna: int) -> str:
    if antenna not in SUPPORTED_ANTENNAS:
        raise ValueError(f"antenna must be 1 or 2, got {antenna!r}")
    return f"AT#SETACTANT={_require_unit(unit)},{antenna}"


def format_request_active_antenna(unit: int = 0) -> str:
    return f"AT#REQACTANT={_require_unit(unit)}"


def format_set_detection_mode(mode: int, internal_hex: str = "") -> str:
    if mode not in SUPPORTED_DETECTION_MODES:
        raise ValueError(f"detection mode must be 1 or 2, got {mode!r}")
    # The firmware (SG_0.10b220) rejects a trailing comma with empty data
    # (`AT#SETDETMODE=2,` -> ERROR). Only append the internal_data field when
    # one is actually provided.
    if internal_hex:
        return f"AT#SETDETMODE={mode},{internal_hex}"
    return f"AT#SETDETMODE={mode}"


def format_request_detection_mode() -> str:
    return "AT#REQDETMODE"


def format_get_version() -> str:
    return "AT#GETVERSION?"


def format_reset() -> str:
    return "AT#RESET"
