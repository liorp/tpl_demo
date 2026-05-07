from backend.parsing.parser import ControlFrame, parse_line


def test_parse_detect_event():
    result = parse_line("#EVTDETECT=11,12,555,500")

    assert isinstance(result, dict)
    assert result["type"] == "detection"
    assert result["unit_a"] == 11
    assert result["unit_b"] == 12
    assert result["value"] == 555
    assert result["threshold"] == 500


def test_parse_detection_comm_event():
    result = parse_line("#EVTDETCOM=10,11,2025,2000")

    assert isinstance(result, dict)
    assert result["type"] == "comm_loss"
    assert result["unit_a"] == 10
    assert result["unit_b"] == 11
    assert result["no_comm_ms"] == 2025
    assert result["no_comm_threshold"] == 2000


def test_parse_link_up_event():
    result = parse_line("#EVTMESHLINKUP=10,11,-27,300,64,00000000")

    assert isinstance(result, dict)
    assert result["type"] == "link_up"
    assert result["reporting_unit"] == 10
    assert result["linked_unit"] == 11
    assert result["rssi"] == -27
    assert result["threshold_cfg"] == 300
    assert result["gain_cfg"] == 64


def test_parse_link_up_event_with_rssi_zero():
    result = parse_line("#EVTMESHLINKUP=11,1,0,0,0")

    assert isinstance(result, dict)
    assert result["type"] == "link_up"
    assert result["rssi"] == 0
    assert result["threshold_cfg"] == 0
    assert result["gain_cfg"] == 0


def test_parse_link_down_event():
    result = parse_line("#EVTMESHLINKDOWN=10,11,-90,8")

    assert isinstance(result, dict)
    assert result["type"] == "link_down"
    assert result["reporting_unit"] == 10
    assert result["linked_unit"] == 11
    assert result["last_rssi"] == -90
    assert result["reason"] == 8


def test_parse_mesh_map_dev_event():
    result = parse_line('#EVTMESHMAPDEV=10,"SG_0_10b19", 3015,00000000')

    assert isinstance(result, dict)
    assert result["type"] == "map_dev"
    assert result["unit_id"] == 10
    assert result["version"] == "SG_0_10b19"
    assert result["voltage"] == 3015


def test_parse_mesh_map_dev_link_event():
    result = parse_line("#EVTMESHMAPDEVLINK=10,11,-27,300,64,00000000")

    assert isinstance(result, dict)
    assert result["type"] == "map_link"
    assert result["reporting_unit"] == 10
    assert result["linked_unit"] == 11
    assert result["rssi"] == -27
    assert result["threshold"] == 300
    assert result["gain"] == 64


def test_parse_error_event_with_colon():
    result = parse_line("#EVTERR: 7,channel busy")

    assert isinstance(result, dict)
    assert result["type"] == "error"
    assert result["error_number"] == 7
    assert result["error_text"] == "channel busy"


def test_parse_trace_event_with_colon():
    result = parse_line("#EVTTRACE: state machine entered idle")

    assert isinstance(result, dict)
    assert result["type"] == "trace"
    assert result["text"] == "state machine entered idle"


def test_parse_active_antenna_event():
    result = parse_line("#EVTACTANT=11,2,3")

    assert isinstance(result, dict)
    assert result["type"] == "antenna"
    assert result["unit"] == 11
    assert result["active_antenna"] == 2
    assert result["supported_antennas"] == 3


def test_parse_detection_mode_event():
    result = parse_line("#EVTDETMODE=2,deadbeef")

    assert isinstance(result, dict)
    assert result["type"] == "detection_mode"
    assert result["mode"] == 2
    assert result["internal_data"] == "deadbeef"


def test_parse_ping_response():
    result = parse_line("#PINGRSP=10,160")

    assert isinstance(result, dict)
    assert result["type"] == "ping_response"
    assert result["unit"] == 10
    assert result["round_trip_ms"] == 160


def test_parse_get_version_response():
    result = parse_line("#GETVERSION:1.0b24")

    assert isinstance(result, dict)
    assert result["type"] == "version"
    assert result["version"] == "1.0b24"


def test_parse_ok_token():
    result = parse_line("OK")
    assert result == ControlFrame(type="ok")


def test_parse_error_token():
    result = parse_line("ERROR")
    assert result == ControlFrame(type="error")


def test_parse_ready_token():
    result = parse_line("ATCMD_CLI_READY")
    assert result == ControlFrame(type="ready")


def test_parse_strips_ansi_and_whitespace():
    result = parse_line("\x1b[32m  #EVTDETECT=11,12,555,500  \x1b[0m\r\n")
    assert isinstance(result, dict)
    assert result["type"] == "detection"


def test_parse_returns_none_for_unknown_tag():
    assert parse_line("#EVTUNKNOWNFOO=1,2") is None


def test_parse_returns_none_for_garbage():
    assert parse_line("not an at line") is None


def test_parse_returns_none_for_empty_line():
    assert parse_line("") is None


def test_parse_detect_event_rejects_bad_arity():
    assert parse_line("#EVTDETECT=11,12") is None


def test_parse_detect_event_rejects_non_numeric():
    assert parse_line("#EVTDETECT=foo,12,555,500") is None
