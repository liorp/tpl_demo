import re

from backend.core.models import Event

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
TIMESTAMP_RE = re.compile(r"^\[(\d+)\]\s+I\s+(.*)")
DETECTION_RE = re.compile(
    r"CMD:DETECTION\s+(\w+)\((\d+)\)-(\w+)\((\d+)\)\s+th:(\d+)\s+val:(\d+)\s+c:(\d+)"
)
DETECTION_COMM_RE = re.compile(
    r"CMD:DETECTION-COMM\s+(\w+)\((\d+)\)-(\w+)\((\d+)\)\s+(\d+)"
)
CONNECTED_RE = re.compile(
    r"CMD:CONNECTED\s+(\w+)\((\d+)\)\s+connected:(\w+)\((\d+)\)\s+([01])"
)
MAP_RSP_RE = re.compile(
    r"CMD:MAP_RSP\s+from\s+(\d+)\s+ver:(\S+)\s+gain:(\d+)\s+voltage:(\d+)\s+scan:(\d+)\s+adv:(\d+):\s+(.*)"
)
MAP_LINK_RE = re.compile(r"\[(\d+)\s+th3:(\d+)\s+(-?\d+)dBm\s+dt:(\d+)\]")
CONFIG_RE = re.compile(r"CMD:CONFIG\s+threshold:(\d+)\s+val:(\d+)")


def parse_line(raw_line: str) -> Event | None:
    line = ANSI_RE.sub("", raw_line).strip()
    if not line:
        return None
    ts_match = TIMESTAMP_RE.match(line)
    if not ts_match:
        return None

    device_ts = int(ts_match.group(1))
    content = ts_match.group(2)

    m = DETECTION_RE.search(content)
    if m:
        return {
            "type": "detection",
            "id_a": m.group(1),
            "unit_a": int(m.group(2)),
            "id_b": m.group(3),
            "unit_b": int(m.group(4)),
            "th": int(m.group(5)),
            "threshold": int(m.group(5)),
            "val": int(m.group(6)),
            "value": int(m.group(6)),
            "c": int(m.group(7)),
            "count": int(m.group(7)),
            "device_ts": device_ts,
        }

    m = DETECTION_COMM_RE.search(content)
    if m:
        return {
            "type": "comm_loss",
            "id_a": m.group(1),
            "unit_a": int(m.group(2)),
            "id_b": m.group(3),
            "unit_b": int(m.group(4)),
            "val": int(m.group(5)),
            "value": int(m.group(5)),
            "device_ts": device_ts,
        }

    m = CONNECTED_RE.search(content)
    if m:
        return {
            "type": "connected",
            "id_unit": m.group(1),
            "unit": int(m.group(2)),
            "id_peer": m.group(3),
            "peer": int(m.group(4)),
            "connected": m.group(5) == "1",
            "device_ts": device_ts,
        }

    m = MAP_RSP_RE.search(content)
    if m:
        unit_id = int(m.group(1))
        links: list[dict[str, int]] = []
        for link_match in MAP_LINK_RE.finditer(m.group(7)):
            links.append(
                {
                    "side1": unit_id,
                    "side2": int(link_match.group(1)),
                    "th3": int(link_match.group(2)),
                    "threshold": int(link_match.group(2)),
                    "rssi": int(link_match.group(3)),
                    "dt": int(link_match.group(4)),
                }
            )
        return {
            "type": "map",
            "unit_id": unit_id,
            "ver": m.group(2),
            "version": m.group(2),
            "gain": int(m.group(3)),
            "voltage": int(m.group(4)),
            "scan": int(m.group(5)),
            "adv": int(m.group(6)),
            "links": links,
            "device_ts": device_ts,
        }

    m = CONFIG_RE.search(content)
    if m:
        return {
            "type": "config",
            "threshold": int(m.group(1)),
            "val": int(m.group(2)),
            "value": int(m.group(2)),
            "device_ts": device_ts,
        }

    return None
