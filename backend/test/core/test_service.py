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


def test_handle_detection_sets_crossing_alert_and_log():
    state = SensorState()
    event = {
        "type": "detection",
        "unit_a": 1,
        "unit_b": 2,
        "value": 70,
        "threshold": 50,
        "device_ts": 123,
    }

    changed = handle_event(state, event)

    assert changed is True
    assert state.crossing_alert is not None
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
    assert "alarm" not in current
    assert isinstance(current["events"], list)
    assert current["links"] == []
    assert current["crossing_alert"] is None
    assert current["config"] == {
        "noise_threshold": None,
        "gain": None,
        "detection_mode": None,
    }
    assert current["units"] == []
    assert current["sensor_status"] == {}
    assert current["ping_latencies"] == {}
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


def test_handle_detection_updates_crossing_alert():
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "detection",
            "unit_a": 1,
            "unit_b": 2,
            "value": 549,
            "threshold": 500,
            "device_ts": 321,
        },
    )

    assert changed is True
    assert state.crossing_alert is not None
    assert state.crossing_alert["sensor_a"] == 1
    assert state.crossing_alert["sensor_b"] == 2
    assert state.crossing_alert["value"] == 549
    assert state.crossing_alert["threshold"] == 500


def test_handle_detection_uses_current_time_when_device_timestamp_missing(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_000_123.0)
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "detection",
            "unit_a": 1,
            "unit_b": 2,
            "value": 549,
            "threshold": 500,
        },
    )

    assert changed is True
    assert state.crossing_alert is not None
    assert state.crossing_alert["timestamp"] == 1_700_000_123


def test_handle_map_link_event_inserts_or_replaces_link(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_000_123.0)
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "map_link",
            "reporting_unit": 7,
            "linked_unit": 2,
            "rssi": -57,
            "threshold": 0,
            "gain": 64,
        },
    )

    assert changed is True
    assert state.links == [
        {
            "side1": 2,
            "side2": 7,
            "threshold": 0,
            "gain": 64,
            "rssi": -57,
            "updated_at": 1_700_000_123,
        }
    ]


def test_handle_map_link_event_deduplicates_pair(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_000_321.0)
    state = SensorState()

    handle_event(
        state,
        {
            "type": "map_link",
            "reporting_unit": 7,
            "linked_unit": 2,
            "rssi": -57,
            "threshold": 0,
            "gain": 64,
        },
    )
    handle_event(
        state,
        {
            "type": "map_link",
            "reporting_unit": 2,
            "linked_unit": 7,
            "rssi": -50,
            "threshold": 100,
            "gain": 64,
        },
    )

    assert len(state.links) == 1
    assert state.links[0]["rssi"] == -50
    assert state.links[0]["threshold"] == 100


def test_handle_map_dev_records_voltage_and_version(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_000_500.0)
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "map_dev",
            "unit_id": 11,
            "version": "SG_0_10b19",
            "voltage": 3015,
        },
    )

    assert changed is True
    assert state.sensor_status["11"]["version"] == "SG_0_10b19"
    assert state.sensor_status["11"]["voltage"] == 3015


def test_handle_link_up_sets_threshold_and_gain_on_pair(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_001_000.0)
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "link_up",
            "reporting_unit": 10,
            "linked_unit": 11,
            "rssi": -27,
            "threshold_cfg": 300,
            "gain_cfg": 64,
        },
    )

    assert changed is True
    assert state.links == [
        {
            "side1": 10,
            "side2": 11,
            "threshold": 300,
            "gain": 64,
            "rssi": -27,
            "updated_at": 1_700_001_000,
        }
    ]
    assert state.config["gain"] == 64
    assert state.config["noise_threshold"] == 300


def test_handle_link_down_removes_link_and_marks_peers_disconnected(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_002_000.0)
    state = SensorState()
    handle_event(
        state,
        {
            "type": "link_up",
            "reporting_unit": 10,
            "linked_unit": 11,
            "rssi": -27,
            "threshold_cfg": 300,
            "gain_cfg": 64,
        },
    )

    changed = handle_event(
        state,
        {
            "type": "link_down",
            "reporting_unit": 10,
            "linked_unit": 11,
            "last_rssi": -90,
            "reason": 8,
        },
    )

    assert changed is True
    assert state.links == []
    assert state.sensor_status["10"]["connected_peers"] == []
    assert state.sensor_status["11"]["connected_peers"] == []


def test_handle_detection_ignores_legacy_global_detection_threshold():
    state = SensorState()
    state.config["detection_threshold"] = 700
    event = {
        "type": "detection",
        "unit_a": 1,
        "unit_b": 2,
        "value": 650,
        "threshold": 500,
        "device_ts": 321,
    }

    changed = handle_event(state, event)

    assert changed is True
    assert state.crossing_alert == {
        "sensor_a": 1,
        "sensor_b": 2,
        "timestamp": 321,
        "value": 650,
        "threshold": 500,
        "lat": None,
        "lng": None,
        "acknowledged": False,
    }
    assert state.logs[0]["msg"].startswith("DETECTION")


def test_handle_ping_response_records_latency(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_003_000.0)
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "ping_response",
            "unit": 11,
            "round_trip_ms": 232,
        },
    )

    assert changed is True
    assert state.ping_latencies[11] == {
        "round_trip_ms": 232,
        "received_at": 1_700_003_000.0,
    }


def test_handle_antenna_event_records_status(monkeypatch):
    monkeypatch.setattr(service, "now_ts", lambda: 1_700_004_000.0)
    state = SensorState()

    changed = handle_event(
        state,
        {
            "type": "antenna",
            "unit": 11,
            "active_antenna": 2,
            "supported_antennas": 3,
        },
    )

    assert changed is True
    assert state.sensor_status["11"]["active_antenna"] == 2
    assert state.sensor_status["11"]["supported_antennas"] == 3


def test_handle_detection_mode_updates_config():
    state = SensorState()

    changed = handle_event(
        state,
        {"type": "detection_mode", "mode": 2, "internal_data": "deadbeef"},
    )

    assert changed is True
    assert state.config["detection_mode"] == 2


def test_handle_error_event_logs_at_error_level():
    state = SensorState()

    changed = handle_event(
        state,
        {"type": "error", "error_number": 7, "error_text": "channel busy"},
    )

    assert changed is True
    assert state.logs[0]["msg"].startswith("ERROR #7")


def test_handle_trace_event_logs_at_debug_level():
    state = SensorState()

    changed = handle_event(
        state,
        {"type": "trace", "text": "fsm idle"},
    )

    assert changed is True
    assert state.logs[0]["msg"].startswith("TRACE")


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
            "unit_a": 1,
            "unit_b": 2,
            "value": 549,
            "threshold": 500,
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
            "unit_a": 1,
            "unit_b": 2,
            "value": 549,
            "threshold": 500,
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
