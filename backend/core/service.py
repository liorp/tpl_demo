import math
from collections.abc import Callable
from pathlib import Path

from backend.core.layout_store import ALLOWED_BOUNDS
from backend.core.models import (
    CrossingAlert,
    Event,
    GeoBounds,
    SensorState,
    SensorStatusEntry,
    SideLink,
    UnitPosition,
    now_ts,
)


def _normalize_side_links(raw_links: list[dict]) -> list[SideLink]:
    normalized: list[SideLink] = []
    seen: set[tuple[int, int]] = set()
    for link in raw_links:
        side1_raw = link.get("side1")
        side2_raw = link.get("side2")
        if not isinstance(side1_raw, int) or not isinstance(side2_raw, int):
            continue
        if side1_raw == side2_raw:
            continue
        side1 = min(side1_raw, side2_raw)
        side2 = max(side1_raw, side2_raw)
        pair = (side1, side2)
        if pair in seen:
            continue
        seen.add(pair)
        normalized.append(
            {
                "side1": side1,
                "side2": side2,
                "quality": int(link.get("quality", 0)),
                "intensity": int(link.get("intensity", 0)),
            }
        )
    return normalized


def _event_last_seen() -> int:
    return int(now_ts())


def _extract_peers(entry: SensorStatusEntry, sensor_id: int) -> set[int]:
    raw_peers = entry.get("connected_peers", [])
    if not isinstance(raw_peers, list):
        return set()
    peers: set[int] = set()
    for peer in raw_peers:
        if isinstance(peer, int) and peer != sensor_id:
            peers.add(peer)
    return peers


def _update_sensor_link_status(
    state: SensorState, sensor_id: int, peer_id: int, connected: bool, last_seen: int
) -> None:
    sensor_key = str(sensor_id)
    entry = state.sensor_status.get(sensor_key, {})
    peers = _extract_peers(entry, sensor_id)
    if connected:
        peers.add(peer_id)
    else:
        peers.discard(peer_id)
    state.sensor_status[sensor_key] = SensorStatusEntry(
        active=len(peers) > 0,
        last_seen=last_seen,
        connected_peers=sorted(peers),
    )


def _refresh_sensor_status_from_map(
    state: SensorState, unit_id: int | None, last_seen: int
) -> None:
    graph: dict[int, set[int]] = {}
    for link in state.links:
        side1 = link.get("side1")
        side2 = link.get("side2")
        if not isinstance(side1, int) or not isinstance(side2, int):
            continue
        graph.setdefault(side1, set()).add(side2)
        graph.setdefault(side2, set()).add(side1)

    touched = set(graph.keys())
    if isinstance(unit_id, int):
        touched.add(unit_id)
    for sensor_id in touched:
        peers = sorted(graph.get(sensor_id, set()))
        state.sensor_status[str(sensor_id)] = SensorStatusEntry(
            active=len(peers) > 0,
            last_seen=last_seen,
            connected_peers=peers,
        )


def _unit_coordinates(state: SensorState, unit_id: int) -> tuple[float, float] | None:
    for unit in state.units:
        if unit["id"] == unit_id:
            return (float(unit["lat"]), float(unit["lng"]))
    return None


def _crossing_coordinates(
    state: SensorState, sensor_a: int, sensor_b: int
) -> tuple[float | None, float | None]:
    coords_a = _unit_coordinates(state, sensor_a)
    coords_b = _unit_coordinates(state, sensor_b)
    if coords_a and coords_b:
        return ((coords_a[0] + coords_b[0]) / 2.0, (coords_a[1] + coords_b[1]) / 2.0)
    if coords_a:
        return coords_a
    if coords_b:
        return coords_b
    return (None, None)


def set_connection_state(
    state: SensorState, connected: bool, port: str = "None", alarm: str | None = None
) -> None:
    state.serial_connected = connected
    state.current_port = port
    if alarm is not None:
        state.alarm_state = alarm


def acknowledge_alarm(state: SensorState) -> bool:
    if state.alarm_state not in ("alarm", "comm_loss") and state.crossing_alert is None:
        return False
    if state.alarm_state in ("alarm", "comm_loss"):
        set_connection_state(state, True, state.current_port, "clear")
    state.crossing_alert = None
    state.add_log("Alarm acknowledged")
    return True


def handle_event(state: SensorState, event: Event) -> bool:
    etype = event["type"]
    if etype == "detection":
        crossing_lat, crossing_lng = _crossing_coordinates(state, event["unit_a"], event["unit_b"])
        state.last_detection_time = now_ts()
        set_connection_state(state, True, state.current_port, "alarm")
        state.crossing_alert = CrossingAlert(
            sensor_a=event["unit_a"],
            sensor_b=event["unit_b"],
            timestamp=event.get("device_ts"),
            lat=crossing_lat,
            lng=crossing_lng,
            acknowledged=False,
        )
        state.config["threshold"] = event["threshold"]
        state.config["val"] = event["value"]
        state.add_log(
            f"DETECTION {event['id_a']}({event['unit_a']})-{event['id_b']}({event['unit_b']}) "
            f"th={event['threshold']} val={event['value']}"
        )
        return True
    if etype == "comm_loss":
        set_connection_state(state, True, state.current_port, "comm_loss")
        state.add_log(
            f"COMM LOSS {event['id_a']}({event['unit_a']})-{event['id_b']}({event['unit_b']})"
        )
        return True
    if etype == "connected":
        last_seen = _event_last_seen()
        _update_sensor_link_status(
            state,
            sensor_id=event["unit"],
            peer_id=event["peer"],
            connected=event["connected"],
            last_seen=last_seen,
        )
        _update_sensor_link_status(
            state,
            sensor_id=event["peer"],
            peer_id=event["unit"],
            connected=event["connected"],
            last_seen=last_seen,
        )
        state.add_log(
            f"LINK {event['id_unit']}({event['unit']}) -> {event['id_peer']}({event['peer']}): "
            f"{'UP' if event['connected'] else 'DOWN'}"
        )
        return True
    if etype == "map":
        state.links = _normalize_side_links(list(event.get("links", [])))
        _refresh_sensor_status_from_map(
            state, unit_id=event["unit_id"], last_seen=_event_last_seen()
        )
        state.add_log(
            f"MAP from {event['unit_id']} ver={event['version']}"
            f" gain={event['gain']} v={event['voltage']}"
        )
        return True
    if etype == "config":
        state.config["threshold"] = event["threshold"]
        state.config["val"] = event["value"]
        state.add_log(f"CONFIG threshold={event['threshold']} val={event['value']}")
        return True
    return False


def check_auto_reset(state: SensorState, now_ts_value: float, timeout_sec: float) -> bool:
    should_reset = (
        state.alarm_state == "alarm"
        and (now_ts_value - state.last_detection_time > timeout_sec)
    )
    if should_reset:
        set_connection_state(state, True, state.current_port, "clear")
        state.crossing_alert = None
        state.add_log("Alarm cleared (auto-reset)")
        return True
    return False


def mark_disconnected(state: SensorState, reason: str | None = None) -> bool:
    set_connection_state(state, False, "None", "disconnected")
    if reason:
        state.add_log(reason)
    return True


def _within_bounds(lat: float, lng: float, bounds: GeoBounds | None) -> bool:
    if not bounds:
        bounds = ALLOWED_BOUNDS
    return bounds["south"] <= lat <= bounds["north"] and bounds["west"] <= lng <= bounds["east"]


def set_unit_position(
    state: SensorState,
    unit_id: int,
    lat: float,
    lng: float,
    save_fn: Callable,
    layout_path: str | Path,
) -> bool:
    if unit_id < 0:
        return False
    next_lat = float(lat)
    next_lng = float(lng)
    if not math.isfinite(next_lat) or not math.isfinite(next_lng):
        return False
    bounds = state.map_policy.get("bounds")
    if not isinstance(bounds, dict) or not _within_bounds(next_lat, next_lng, bounds):
        return False

    updated = False
    for unit in state.units:
        if unit.get("id") == unit_id:
            unit["lat"] = next_lat
            unit["lng"] = next_lng
            if "label" not in unit:
                unit["label"] = f"S{unit_id}"
            updated = True
            break
    if not updated:
        state.units.append(
            UnitPosition(id=unit_id, label=f"S{unit_id}", lat=next_lat, lng=next_lng)
        )

    persisted = save_fn(
        layout_path, {"units": list(state.units), "map_policy": dict(state.map_policy)}
    )
    state.units = persisted["units"]
    state.map_policy = persisted["map_policy"]
    return True
