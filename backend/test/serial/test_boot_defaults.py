from backend.serial.boot_defaults import detection_mode_command, link_default_commands


def test_detection_mode_command_uses_default_mode():
    assert detection_mode_command() == "AT#SETDETMODE=1"


def test_unconfigured_link_gets_both_gain_and_threshold_defaults():
    event = {"reporting_unit": 10, "linked_unit": 11, "threshold": 0, "gain": 0}
    commands = link_default_commands(event, set())
    assert commands == ["AT#SETDETGAIN=10,11,32", "AT#SETDETTHR=10,11,300"]


def test_configured_threshold_is_preserved_only_gain_is_set():
    event = {"reporting_unit": 10, "linked_unit": 11, "threshold": 300, "gain": 0}
    commands = link_default_commands(event, set())
    assert commands == ["AT#SETDETGAIN=10,11,32"]


def test_configured_gain_is_preserved_only_threshold_is_set():
    event = {"reporting_unit": 10, "linked_unit": 11, "threshold": 0, "gain": 32}
    commands = link_default_commands(event, set())
    assert commands == ["AT#SETDETTHR=10,11,300"]


def test_fully_configured_link_is_left_untouched():
    event = {"reporting_unit": 10, "linked_unit": 11, "threshold": 300, "gain": 64}
    assert link_default_commands(event, set()) == []


def test_pair_is_only_configured_once_per_session():
    configured: set[tuple[int, int]] = set()
    event = {"reporting_unit": 10, "linked_unit": 11, "threshold": 0, "gain": 0}

    first = link_default_commands(event, configured)
    assert first == ["AT#SETDETGAIN=10,11,32", "AT#SETDETTHR=10,11,300"]
    assert (10, 11) in configured

    # The reverse-direction report of the same pair must not re-issue commands.
    reverse = {"reporting_unit": 11, "linked_unit": 10, "threshold": 0, "gain": 0}
    assert link_default_commands(reverse, configured) == []


def test_self_link_is_ignored():
    event = {"reporting_unit": 10, "linked_unit": 10, "threshold": 0, "gain": 0}
    assert link_default_commands(event, set()) == []
