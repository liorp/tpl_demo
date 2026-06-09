"""Detection defaults pushed to the device on each connect.

The detection mode is global and set once after protocol validation. Gain and
threshold are per-pair (``AT#SETDETGAIN``/``AT#SETDETTHR``) and are only applied
to a link while the device still reports the field as unconfigured (``0``), so
values the operator has tuned survive a reconnect. Each pair is configured at
most once per session, keyed by its sorted unit ids.
"""

from __future__ import annotations

from typing import Any

from backend.config import (
    DEFAULT_DETECTION_GAIN,
    DEFAULT_DETECTION_MODE,
    DEFAULT_DETECTION_THRESHOLD,
)
from backend.parsing.encoder import (
    format_set_detection_mode,
    format_set_gain,
    format_set_threshold,
)

UNCONFIGURED = 0


def detection_mode_command() -> str:
    return format_set_detection_mode(DEFAULT_DETECTION_MODE)


def link_default_commands(
    event: dict[str, Any], configured_pairs: set[tuple[int, int]]
) -> list[str]:
    """Return the default gain/threshold commands for a mesh ``map_link`` event.

    Records the pair in ``configured_pairs`` when commands are issued so the
    same pair (in either direction) is not reconfigured again this session.
    """
    reporting = event.get("reporting_unit")
    linked = event.get("linked_unit")
    if not isinstance(reporting, int) or not isinstance(linked, int):
        return []
    if reporting == linked:
        return []

    key = (min(reporting, linked), max(reporting, linked))
    if key in configured_pairs:
        return []

    commands: list[str] = []
    if event.get("gain") == UNCONFIGURED:
        commands.append(format_set_gain(reporting, linked, DEFAULT_DETECTION_GAIN))
    if event.get("threshold") == UNCONFIGURED:
        commands.append(
            format_set_threshold(reporting, linked, DEFAULT_DETECTION_THRESHOLD)
        )

    if commands:
        configured_pairs.add(key)
    return commands
