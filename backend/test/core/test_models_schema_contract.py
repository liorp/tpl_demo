from typing import get_type_hints

from backend.core.models import (
    AntennaEvent,
    CommLossEvent,
    DetectionEvent,
    DetectionModeEvent,
    LinkDownEvent,
    LinkUpEvent,
    MapDevEvent,
    MapLinkEvent,
    PingResponseEvent,
    SensorConfig,
    SideLink,
)


def test_detection_event_has_minimal_fields():
    hints = get_type_hints(DetectionEvent)

    assert "unit_a" in hints
    assert "unit_b" in hints
    assert "value" in hints
    assert "threshold" in hints
    assert "id_a" not in hints
    assert "id_b" not in hints
    assert "count" not in hints


def test_comm_loss_uses_no_comm_fields():
    hints = get_type_hints(CommLossEvent)

    assert "no_comm_ms" in hints
    assert "no_comm_threshold" in hints


def test_link_events_carry_rssi_and_threshold_cfg():
    up = get_type_hints(LinkUpEvent)
    down = get_type_hints(LinkDownEvent)

    assert "rssi" in up
    assert "threshold_cfg" in up
    assert "gain_cfg" in up
    assert "last_rssi" in down
    assert "reason" in down


def test_map_dev_and_map_link_split_event_shapes():
    dev = get_type_hints(MapDevEvent)
    link = get_type_hints(MapLinkEvent)

    assert {"unit_id", "version", "voltage"} <= dev.keys()
    assert {"reporting_unit", "linked_unit", "rssi", "threshold", "gain"} <= link.keys()


def test_ping_and_antenna_and_mode_events_present():
    assert "round_trip_ms" in get_type_hints(PingResponseEvent)
    assert "active_antenna" in get_type_hints(AntennaEvent)
    assert "mode" in get_type_hints(DetectionModeEvent)


def test_sensor_config_includes_detection_mode():
    hints = get_type_hints(SensorConfig)

    assert "detection_mode" in hints
    assert "noise_threshold" in hints
    assert "gain" in hints


def test_side_link_carries_per_pair_gain():
    hints = get_type_hints(SideLink)

    assert "gain" in hints
    assert "threshold" in hints
    assert "rssi" in hints
