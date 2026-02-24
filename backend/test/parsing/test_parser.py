from backend.parsing.parser import parse_line


def test_parse_detection_event():
    line = "[123] I CMD:DETECTION AA(1)-BB(2) th:99 val:101 c:5"

    event = parse_line(line)

    assert event is not None
    assert event["type"] == "detection"
    assert event["unit_a"] == 1
    assert event["unit_b"] == 2
    assert event["threshold"] == 99
    assert event["value"] == 101


def test_parse_map_response_with_signal_links():
    line = (
        "[321] I CMD:MAP_RSP from 7 ver:v1 gain:30 voltage:2600 scan:3 adv:4:"
        "  [2 th3:0 -57dBm dt:180] [12 th3:500 -31dBm dt:721]"
    )

    event = parse_line(line)

    assert event is not None
    assert event["type"] == "map"
    assert event["unit_id"] == 7
    assert event["links"] == [
        {"side1": 7, "side2": 2, "threshold": 0, "rssi": -57, "dt": 180},
        {"side1": 7, "side2": 12, "threshold": 500, "rssi": -31, "dt": 721},
    ]


def test_parse_config_response():
    line = "[444] I CMD:CONFIG threshold:500 val:549"

    event = parse_line(line)

    assert event is not None
    assert event["type"] == "config"
    assert event["threshold"] == 500
    assert event["value"] == 549
