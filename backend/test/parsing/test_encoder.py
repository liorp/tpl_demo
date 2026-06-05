import pytest
from backend.parsing.encoder import (
    format_get_version,
    format_ping,
    format_request_active_antenna,
    format_request_detection_mode,
    format_request_map,
    format_reset,
    format_set_active_antenna,
    format_set_detection_mode,
    format_set_gain,
    format_set_threshold,
)


def test_format_set_threshold():
    assert format_set_threshold(11, 12, 500) == "AT#SETDETTHR=11,12,500"


def test_format_set_threshold_rejects_negative_value():
    with pytest.raises(ValueError):
        format_set_threshold(11, 12, -1)


def test_format_set_threshold_clamps_to_uint16():
    with pytest.raises(ValueError):
        format_set_threshold(11, 12, 65535)


def test_format_set_gain():
    assert format_set_gain(11, 12, 64) == "AT#SETDETGAIN=11,12,64"


def test_format_request_map_default_zero():
    assert format_request_map() == "AT#REQMESHMAP=0"


def test_format_request_map_with_unit():
    assert format_request_map(11) == "AT#REQMESHMAP=11"


def test_format_ping_default_zero():
    assert format_ping() == "AT#PING=0"


def test_format_set_active_antenna():
    assert format_set_active_antenna(11, 1) == "AT#SETACTANT=11,1"


def test_format_set_active_antenna_rejects_invalid_antenna():
    with pytest.raises(ValueError):
        format_set_active_antenna(11, 0)


def test_format_request_active_antenna_default_zero():
    assert format_request_active_antenna() == "AT#REQACTANT=0"


def test_format_set_detection_mode_without_hex():
    # No trailing comma: the device ERRORs on `AT#SETDETMODE=2,`.
    assert format_set_detection_mode(2) == "AT#SETDETMODE=2"


def test_format_set_detection_mode_with_hex():
    assert format_set_detection_mode(1, "deadbeef") == "AT#SETDETMODE=1,deadbeef"


def test_format_set_detection_mode_rejects_invalid_mode():
    with pytest.raises(ValueError):
        format_set_detection_mode(0)


def test_format_request_detection_mode():
    assert format_request_detection_mode() == "AT#REQDETMODE"


def test_format_get_version():
    assert format_get_version() == "AT#GETVERSION?"


def test_format_reset():
    assert format_reset() == "AT#RESET"
