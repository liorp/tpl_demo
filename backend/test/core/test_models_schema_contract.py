from typing import get_args, get_origin, get_type_hints

from backend.core.models import CommLossEvent, ConfigEvent, DetectionEvent, MapEvent, MapLink


def test_detection_event_contract_includes_raw_alias_fields():
    hints = get_type_hints(DetectionEvent)

    assert "th" in hints
    assert "val" in hints
    assert "c" in hints


def test_comm_loss_and_config_contract_include_raw_value_alias():
    comm_hints = get_type_hints(CommLossEvent)
    config_hints = get_type_hints(ConfigEvent)

    assert "val" in comm_hints
    assert "val" in config_hints


def test_map_event_contract_includes_raw_fields_and_typed_links():
    hints = get_type_hints(MapEvent)

    assert "ver" in hints
    assert "scan" in hints
    assert "adv" in hints

    links_type = hints["links"]
    assert get_origin(links_type) is list
    assert get_args(links_type) == (MapLink,)
