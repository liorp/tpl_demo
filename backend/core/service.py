import logging
import math
from collections.abc import Callable
from pathlib import Path

from backend.core.event_logging import log_event
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

logger = logging.getLogger("tpl-signum")


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
    entry = dict(state.sensor_status.get(sensor_key, {}))
    peers = _extract_peers(entry, sensor_id)
    if connected:
        peers.add(peer_id)
    else:
        peers.discard(peer_id)
    entry["last_seen"] = last_seen
    entry["connected_peers"] = sorted(peers)
    state.sensor_status[sensor_key] = entry  # type: ignore[assignment]


def _set_sensor_status_fields(
    state: SensorState, sensor_id: int, last_seen: int, **fields: object
) -> None:
    sensor_key = str(sensor_id)
    entry = dict(state.sensor_status.get(sensor_key, {}))
    entry.setdefault("connected_peers", [])
    entry["last_seen"] = last_seen
    for key, value in fields.items():
        entry[key] = value
    state.sensor_status[sensor_key] = entry  # type: ignore[assignment]


def _upsert_link(
    state: SensorState,
    side_a: int,
    side_b: int,
    *,
    rssi: int,
    threshold: int,
    gain: int,
    updated_at: int,
) -> None:
    side1 = min(side_a, side_b)
    side2 = max(side_a, side_b)
    next_link: SideLink = {
        "side1": side1,
        "side2": side2,
        "threshold": threshold,
        "gain": gain,
        "rssi": rssi,
        "updated_at": updated_at,
    }
    for index, existing in enumerate(state.links):
        if existing["side1"] == side1 and existing["side2"] == side2:
            state.links[index] = next_link
            return
    state.links.append(next_link)


def _remove_link(state: SensorState, side_a: int, side_b: int) -> None:
    side1 = min(side_a, side_b)
    side2 = max(side_a, side_b)
    state.links = [
        link
        for link in state.links
        if not (link["side1"] == side1 and link["side2"] == side2)
    ]


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


def set_connection_state(state: SensorState, connected: bool, port: str = "None") -> None:
    state.serial_connected = connected
    state.current_port = port


def _handle_detection(state: SensorState, event: Event) -> bool:
    last_seen = _event_last_seen()
    _update_sensor_link_status(
        state, sensor_id=event["unit_a"], peer_id=event["unit_b"],
        connected=True, last_seen=last_seen,
    )
    _update_sensor_link_status(
        state, sensor_id=event["unit_b"], peer_id=event["unit_a"],
        connected=True, last_seen=last_seen,
    )
    crossing_lat, crossing_lng = _crossing_coordinates(
        state, event["unit_a"], event["unit_b"]
    )
    state.last_detection_time = now_ts()
    device_ts = event.get("device_ts")
    set_connection_state(state, True, state.current_port)
    state.crossing_alert = CrossingAlert(
        sensor_a=event["unit_a"],
        sensor_b=event["unit_b"],
        timestamp=device_ts if device_ts is not None else last_seen,
        value=event["value"],
        threshold=event["threshold"],
        lat=crossing_lat,
        lng=crossing_lng,
        acknowledged=False,
    )
    log_event(
        state,
        logger,
        f"DETECTION {event['unit_a']}-{event['unit_b']} "
        f"th={event['threshold']} val={event['value']}",
        fields=event,
    )
    return True


def _handle_comm_loss(state: SensorState, event: Event) -> bool:
    last_seen = _event_last_seen()
    _update_sensor_link_status(
        state, sensor_id=event["unit_a"], peer_id=event["unit_b"],
        connected=True, last_seen=last_seen,
    )
    _update_sensor_link_status(
        state, sensor_id=event["unit_b"], peer_id=event["unit_a"],
        connected=True, last_seen=last_seen,
    )
    set_connection_state(state, True, state.current_port)
    log_event(
        state,
        logger,
        f"COMM LOSS {event['unit_a']}-{event['unit_b']} "
        f"no_comm_ms={event['no_comm_ms']}",
        fields=event,
    )
    return True


def _handle_link_up(state: SensorState, event: Event) -> bool:
    last_seen = _event_last_seen()
    reporting = event["reporting_unit"]
    linked = event["linked_unit"]
    _update_sensor_link_status(
        state, sensor_id=reporting, peer_id=linked,
        connected=True, last_seen=last_seen,
    )
    _update_sensor_link_status(
        state, sensor_id=linked, peer_id=reporting,
        connected=True, last_seen=last_seen,
    )
    _upsert_link(
        state, reporting, linked,
        rssi=event["rssi"],
        threshold=event["threshold_cfg"],
        gain=event["gain_cfg"],
        updated_at=last_seen,
    )
    state.config["gain"] = event["gain_cfg"]
    state.config["noise_threshold"] = event["threshold_cfg"]
    log_event(
        state,
        logger,
        f"LINK UP {reporting}->{linked} rssi={event['rssi']}",
        fields=event,
    )
    return True


def _handle_link_down(state: SensorState, event: Event) -> bool:
    last_seen = _event_last_seen()
    reporting = event["reporting_unit"]
    linked = event["linked_unit"]
    _update_sensor_link_status(
        state, sensor_id=reporting, peer_id=linked,
        connected=False, last_seen=last_seen,
    )
    _update_sensor_link_status(
        state, sensor_id=linked, peer_id=reporting,
        connected=False, last_seen=last_seen,
    )
    _remove_link(state, reporting, linked)
    log_event(
        state,
        logger,
        f"LINK DOWN {reporting}->{linked} reason={event['reason']}",
        fields=event,
    )
    return True


def _handle_map_dev(state: SensorState, event: Event) -> bool:
    last_seen = _event_last_seen()
    _set_sensor_status_fields(
        state,
        sensor_id=event["unit_id"],
        last_seen=last_seen,
        version=event["version"],
        voltage=event["voltage"],
    )
    log_event(
        state,
        logger,
        f"MAP_DEV {event['unit_id']} ver={event['version']} v={event['voltage']}",
        fields=event,
    )
    return True


def _handle_map_link(state: SensorState, event: Event) -> bool:
    last_seen = _event_last_seen()
    reporting = event["reporting_unit"]
    linked = event["linked_unit"]
    _update_sensor_link_status(
        state, sensor_id=reporting, peer_id=linked,
        connected=True, last_seen=last_seen,
    )
    _update_sensor_link_status(
        state, sensor_id=linked, peer_id=reporting,
        connected=True, last_seen=last_seen,
    )
    _upsert_link(
        state, reporting, linked,
        rssi=event["rssi"],
        threshold=event["threshold"],
        gain=event["gain"],
        updated_at=last_seen,
    )
    state.config["gain"] = event["gain"]
    state.config["noise_threshold"] = event["threshold"]
    log_event(
        state,
        logger,
        f"MAP_LINK {reporting}->{linked} rssi={event['rssi']} "
        f"th={event['threshold']} gain={event['gain']}",
        fields=event,
    )
    return True


def _handle_error(state: SensorState, event: Event) -> bool:
    log_event(
        state,
        logger,
        f"ERROR #{event['error_number']}: {event['error_text']}",
        level="error",
        fields=event,
    )
    return True


def _handle_trace(state: SensorState, event: Event) -> bool:
    log_event(state, logger, f"TRACE {event['text']}", level="debug", fields=event)
    return True


def _handle_ping_response(state: SensorState, event: Event) -> bool:
    state.ping_latencies[event["unit"]] = {
        "round_trip_ms": event["round_trip_ms"],
        "received_at": now_ts(),
    }
    log_event(
        state,
        logger,
        f"PING u={event['unit']} rtt={event['round_trip_ms']}ms",
        fields=event,
    )
    return True


def _handle_antenna(state: SensorState, event: Event) -> bool:
    last_seen = _event_last_seen()
    _set_sensor_status_fields(
        state,
        sensor_id=event["unit"],
        last_seen=last_seen,
        active_antenna=event["active_antenna"],
        supported_antennas=event["supported_antennas"],
    )
    log_event(
        state,
        logger,
        f"ANTENNA u={event['unit']} active={event['active_antenna']} "
        f"supported={event['supported_antennas']}",
        fields=event,
    )
    return True


def _handle_detection_mode(state: SensorState, event: Event) -> bool:
    state.config["detection_mode"] = event["mode"]
    log_event(
        state,
        logger,
        f"DETECTION_MODE mode={event['mode']}",
        fields=event,
    )
    return True


_HANDLERS: dict[str, Callable[[SensorState, Event], bool]] = {
    "detection": _handle_detection,
    "comm_loss": _handle_comm_loss,
    "link_up": _handle_link_up,
    "link_down": _handle_link_down,
    "map_dev": _handle_map_dev,
    "map_link": _handle_map_link,
    "error": _handle_error,
    "trace": _handle_trace,
    "ping_response": _handle_ping_response,
    "antenna": _handle_antenna,
    "detection_mode": _handle_detection_mode,
}


def handle_event(state: SensorState, event: Event) -> bool:
    handler = _HANDLERS.get(event["type"])
    if handler is None:
        return False
    return handler(state, event)


def check_auto_reset(state: SensorState, now_ts_value: float, timeout_sec: float) -> bool:
    should_reset = (
        state.crossing_alert is not None
        and (now_ts_value - state.last_detection_time > timeout_sec)
    )
    if should_reset:
        state.crossing_alert = None
        log_event(state, logger, "Alarm cleared (auto-reset)")
        return True
    return False


def mark_disconnected(state: SensorState, reason: str | None = None) -> bool:
    set_connection_state(state, False, "None")
    if reason:
        log_event(state, logger, reason, level="warning")
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
