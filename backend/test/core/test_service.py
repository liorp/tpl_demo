from backend.core.models import SensorState, snapshot
from backend.core.service import handle_event


def test_handle_detection_sets_alarm_and_log():
    state = SensorState()
    event = {
        "type": "detection",
        "id_a": "A",
        "unit_a": 1,
        "id_b": "B",
        "unit_b": 2,
        "threshold": 50,
        "value": 70,
        "count": 1,
        "device_ts": 123,
    }

    changed = handle_event(state, event)

    assert changed is True
    assert state.alarm_state == "alarm"
    assert state.logs[0]["msg"].startswith("DETECTION")


def test_snapshot_includes_command_map_defaults():
    state = SensorState()

    current = snapshot(state)

    assert current["connected"] is False
    assert current["port"] == "None"
    assert current["alarm"] == "disconnected"
    assert isinstance(current["events"], list)
    assert current["links"] == []
    assert current["crossing_alert"] is None
    assert current["config"] == {"threshold": None, "val": None}


def test_handle_detection_updates_crossing_and_config():
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "detection",
            "id_a": "AA",
            "unit_a": 1,
            "id_b": "BB",
            "unit_b": 2,
            "threshold": 500,
            "value": 549,
            "count": 1,
            "device_ts": 321,
        },
    )

    assert changed is True
    assert state.crossing_alert is not None
    assert state.crossing_alert["sensor_a"] == 1
    assert state.crossing_alert["sensor_b"] == 2
    assert state.config == {"threshold": 500, "val": 549}


def test_handle_map_event_updates_links():
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "map",
            "unit_id": 7,
            "version": "v1",
            "gain": 30,
            "voltage": 2600,
            "links": [{"side1": 2, "side2": 1, "quality": 88, "intensity": 73}],
            "device_ts": 444,
        },
    )

    assert changed is True
    assert state.links == [{"side1": 1, "side2": 2, "quality": 88, "intensity": 73}]


def test_handle_map_event_deduplicates_bidirectional_links():
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "map",
            "unit_id": 7,
            "version": "v1",
            "gain": 30,
            "voltage": 2600,
            "links": [
                {"side1": 1, "side2": 2, "quality": 88, "intensity": 73},
                {"side1": 2, "side2": 1, "quality": 60, "intensity": 55},
            ],
            "device_ts": 445,
        },
    )

    assert changed is True
    assert state.links == [{"side1": 1, "side2": 2, "quality": 88, "intensity": 73}]


def test_handle_config_event_updates_config_values():
    state = SensorState()

    changed = handle_event(
        state,
        {"type": "config", "threshold": 777, "value": 799, "device_ts": 555},
    )

    assert changed is True
    assert state.config == {"threshold": 777, "val": 799}
