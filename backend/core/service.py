from backend.core.models import Event, SensorState, now_ts


def _normalize_side_links(raw_links: list[dict]) -> list[dict]:
    normalized: list[dict] = []
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


def set_connection_state(
    state: SensorState, connected: bool, port: str = "None", alarm: str | None = None
) -> None:
    with state.lock:
        state.serial_connected = connected
        state.current_port = port
        if alarm is not None:
            state.alarm_state = alarm


def acknowledge_alarm(state: SensorState) -> bool:
    if state.alarm_state != "alarm":
        return False
    set_connection_state(state, True, state.current_port, "clear")
    state.crossing_alert = None
    state.add_log("Alarm acknowledged")
    return True


def handle_event(state: SensorState, event: Event) -> bool:
    etype = event["type"]
    if etype == "detection":
        state.last_detection_time = now_ts()
        set_connection_state(state, True, state.current_port, "alarm")
        state.crossing_alert = {
            "sensor_a": event["unit_a"],
            "sensor_b": event["unit_b"],
            "timestamp": event.get("device_ts"),
            "lat": None,
            "lng": None,
            "acknowledged": False,
        }
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
        state.add_log(
            f"LINK {event['id_unit']}({event['unit']}) -> {event['id_peer']}({event['peer']}): "
            f"{'UP' if event['connected'] else 'DOWN'}"
        )
        return True
    if etype == "map":
        state.links = _normalize_side_links(list(event.get("links", [])))
        state.add_log(
            f"MAP from {event['unit_id']} ver={event['version']} gain={event['gain']} v={event['voltage']}"
        )
        return True
    if etype == "config":
        state.config["threshold"] = event["threshold"]
        state.config["val"] = event["value"]
        state.add_log(f"CONFIG threshold={event['threshold']} val={event['value']}")
        return True
    return False


def check_auto_reset(state: SensorState, now_ts_value: float, timeout_sec: float) -> bool:
    with state.lock:
        should_reset = (
            state.alarm_state == "alarm"
            and (now_ts_value - state.last_detection_time > timeout_sec)
        )
    if should_reset:
        set_connection_state(state, True, state.current_port, "clear")
        state.add_log("Alarm cleared (auto-reset)")
        return True
    return False


def mark_disconnected(state: SensorState, reason: str | None = None) -> bool:
    set_connection_state(state, False, "None", "disconnected")
    with state.serial_lock:
        if state.serial_conn:
            try:
                state.serial_conn.close()
            except Exception:
                pass
            state.serial_conn = None
    if reason:
        state.add_log(reason)
    return True
