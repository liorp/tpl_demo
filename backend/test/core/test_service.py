import backend.core.models as models
import backend.core.service as service
import pytest
from backend.core.layout_store import (
    ALLOWED_BOUNDS,
    MAP_BUFFER_KM,
    load_layout_state,
    save_layout_state,
)
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


def test_add_log_without_fields_keeps_time_and_message_shape():
    state = SensorState()
    state.add_log("hello")

    assert set(state.logs[0].keys()) == {"time", "msg"}


def test_snapshot_includes_command_map_defaults():
    state = SensorState()

    current = snapshot(state)

    assert current["connected"] is False
    assert current["port"] == "None"
    assert current["alarm"] == "disconnected"
    assert isinstance(current["events"], list)
    assert current["links"] == []
    assert current["crossing_alert"] is None
    assert current["config"] == {
        "noise_threshold": None,
        "detection_threshold": None,
        "gain": None,
    }
    assert current["units"] == []
    assert current["sensor_status"] == {}
    assert current["map_policy"] == {
        "bounds": None,
        "buffer_km": None,
        "tile_root": None,
        "offline_required": False,
    }


def test_snapshot_includes_mutated_runtime_fields():
    state = SensorState()
    state.units = [{"id": 1, "label": "S1", "lat": 33.31, "lng": 35.78}]
    state.sensor_status = {
        "1": {"last_seen": 1700000000, "connected_peers": [2, 3]}
    }
    state.map_policy = {
        "bounds": {"north": 1.0, "south": 0.0, "east": 1.0, "west": 0.0},
        "buffer_km": 2.5,
        "tile_root": "/tiles",
        "offline_required": True,
    }

    current = snapshot(state)

    assert current["units"] == [{"id": 1, "label": "S1", "lat": 33.31, "lng": 35.78}]
    assert current["sensor_status"] == {
        "1": {"last_seen": 1700000000, "connected_peers": [2, 3]}
    }
    assert current["map_policy"] == {
        "bounds": {"north": 1.0, "south": 0.0, "east": 1.0, "west": 0.0},
        "buffer_km": 2.5,
        "tile_root": "/tiles",
        "offline_required": True,
    }


def test_default_map_policy_uses_typed_contract():
    assert models.__annotations__["DEFAULT_MAP_POLICY"] is models.MapPolicy


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
            "links": [{"side1": 7, "side2": 2, "threshold": 0, "rssi": -57, "dt": 180}],
            "device_ts": 444,
        },
    )

    assert changed is True
    assert state.links == [{"side1": 2, "side2": 7, "threshold": 0, "rssi": -57, "dt": 180}]


def test_handle_event_log_keeps_raw_sensor_field_names():
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "map",
            "unit_id": 7,
            "version": "v1",
            "ver": "v1",
            "gain": 30,
            "voltage": 2600,
            "scan": 3,
            "adv": 4,
            "links": [
                {
                    "side1": 7,
                    "side2": 2,
                    "th3": 500,
                    "threshold": 500,
                    "rssi": -57,
                    "dt": 180,
                }
            ],
            "device_ts": 444,
        },
    )

    assert changed is True
    assert state.logs[0]["type"] == "map"
    assert state.logs[0]["scan"] == 3
    assert state.logs[0]["adv"] == 4
    assert state.logs[0]["links"][0]["th3"] == 500


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
                {"side1": 7, "side2": 2, "threshold": 0, "rssi": -57, "dt": 180},
                {"side1": 7, "side2": 2, "threshold": 0, "rssi": -50, "dt": 200},
            ],
            "device_ts": 445,
        },
    )

    assert changed is True
    assert state.links == [{"side1": 2, "side2": 7, "threshold": 0, "rssi": -57, "dt": 180}]


def test_handle_config_event_updates_config_values():
    state = SensorState()

    changed = handle_event(
        state,
        {"type": "config", "threshold": 777, "value": 799, "device_ts": 555},
    )

    assert changed is True
    assert state.config == {
        "noise_threshold": 777,
        "detection_threshold": None,
        "gain": 799,
    }


def test_handle_detection_between_noise_and_detection_logs_without_alert():
    state = SensorState()
    state.config["detection_threshold"] = 700
    event = {
        "type": "detection",
        "id_a": "AA",
        "unit_a": 1,
        "id_b": "BB",
        "unit_b": 2,
        "threshold": 500,
        "value": 650,
        "count": 1,
        "device_ts": 321,
    }

    changed = handle_event(state, event)

    assert changed is True
    assert state.alarm_state == "disconnected"
    assert state.crossing_alert is None
    assert state.logs[0]["msg"].startswith("DETECTION")


def test_handle_config_event_raises_detection_threshold_to_noise_threshold():
    state = SensorState()
    state.config["detection_threshold"] = 600

    changed = handle_event(
        state,
        {"type": "config", "threshold": 777, "value": 799, "device_ts": 555},
    )

    assert changed is True
    assert state.config["noise_threshold"] == 777
    assert state.config["detection_threshold"] == 777


def test_handle_connected_and_map_update_sensor_status_graph(monkeypatch):
    clock = [1001]
    monkeypatch.setattr(service, "now_ts", lambda: float(clock[0]))

    state = SensorState()

    connected_changed = handle_event(
        state,
        {
            "type": "connected",
            "id_unit": "A",
            "unit": 1,
            "id_peer": "B",
            "peer": 2,
            "connected": True,
            "device_ts": 5000,
        },
    )
    clock[0] = 1002
    disconnected_changed = handle_event(
        state,
        {
            "type": "connected",
            "id_unit": "A",
            "unit": 1,
            "id_peer": "B",
            "peer": 2,
            "connected": False,
            "device_ts": 6000,
        },
    )
    clock[0] = 1003
    map_changed = handle_event(
        state,
        {
            "type": "map",
            "unit_id": 7,
            "version": "v1",
            "gain": 30,
            "voltage": 2600,
            "links": [
                {"side1": 7, "side2": 8, "threshold": 0, "rssi": -30, "dt": 200},
            ],
            "device_ts": 7000,
        },
    )

    assert connected_changed is True
    assert disconnected_changed is True
    assert map_changed is True
    assert state.sensor_status["1"] == {
        "last_seen": 1002,
        "connected_peers": [],
    }
    assert state.sensor_status["2"] == {
        "last_seen": 1002,
        "connected_peers": [],
    }
    assert state.sensor_status["7"] == {
        "last_seen": 1003,
        "connected_peers": [8],
    }
    assert state.sensor_status["8"] == {
        "last_seen": 1003,
        "connected_peers": [7],
    }


def test_handle_detection_sets_crossing_midpoint_when_both_positions_known():
    state = SensorState()
    state.units = [
        {"id": 1, "label": "S1", "lat": 10.0, "lng": 20.0},
        {"id": 2, "label": "S2", "lat": 30.0, "lng": 40.0},
    ]

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
    assert state.crossing_alert["lat"] == 20.0
    assert state.crossing_alert["lng"] == 30.0


@pytest.mark.parametrize(
    ('units', 'expected_lat', 'expected_lng'),
    [
        ([{"id": 1, "label": "S1", "lat": 10.0, "lng": 20.0}], 10.0, 20.0),
        ([], None, None),
    ],
)
def test_handle_detection_sets_crossing_coordinates_with_missing_positions(
    units, expected_lat, expected_lng
):
    state = SensorState()
    state.units = units

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
    assert state.crossing_alert["lat"] == expected_lat
    assert state.crossing_alert["lng"] == expected_lng


def test_layout_store_load_missing_file_returns_safe_defaults(tmp_path):
    layout_path = tmp_path / "layout.json"

    loaded = load_layout_state(layout_path)

    assert loaded["units"] == []
    assert loaded["map_policy"]["buffer_km"] == MAP_BUFFER_KM
    assert loaded["map_policy"]["bounds"] == ALLOWED_BOUNDS


def test_layout_store_save_and_reload_units(tmp_path):
    layout_path = tmp_path / "layout.json"
    payload = {
        "units": [
            {"id": 7, "label": "S7", "lat": 33.31, "lng": 35.78},
            {"id": 11, "label": "S11", "lat": 31.81, "lng": 34.66},
        ]
    }

    save_layout_state(layout_path, payload)
    loaded = load_layout_state(layout_path)

    assert loaded["units"] == payload["units"]
    assert loaded["map_policy"]["buffer_km"] == MAP_BUFFER_KM


def test_layout_store_rejects_out_of_bounds_coordinates(tmp_path):
    layout_path = tmp_path / "layout.json"

    invalid_payload = {"units": [{"id": 7, "label": "S7", "lat": 40.0, "lng": 35.78}]}

    with pytest.raises(ValueError, match="outside allowed map bounds"):
        save_layout_state(layout_path, invalid_payload)


def test_layout_store_load_corrupted_json_falls_back_to_defaults(tmp_path):
    layout_path = tmp_path / "layout.json"
    layout_path.write_text("{not json", encoding="utf-8")

    loaded = load_layout_state(layout_path)

    assert loaded["units"] == []
    assert loaded["map_policy"]["buffer_km"] == MAP_BUFFER_KM
