import dummy_device
import pytest
from dummy_device import build_start_commands


def test_build_start_commands_includes_serial_port_for_backend_and_full_stack() -> None:
    commands = build_start_commands('/dev/ttys027')

    assert commands['backend'] == 'SERIAL_PORT=/dev/ttys027 bun run dev:backend'
    assert commands['frontend'] == 'bun run dev:frontend'


def test_build_start_commands_includes_no_env_user_commands() -> None:
    commands = build_start_commands('/dev/ttys027')

    assert commands['run_backend'] == 'bun run dev:backend'
    assert commands['run_frontend'] == 'bun run dev:frontend'


def test_parse_args_does_not_expose_server_launch_modes() -> None:
    dummy_device._parse_args([])


def test_parse_args_accepts_port_file() -> None:
    args = dummy_device._parse_args(['--port-file', '/tmp/test-port'])
    assert args.port_file == '/tmp/test-port'


def test_parse_args_port_file_defaults_to_none() -> None:
    args = dummy_device._parse_args([])
    assert args.port_file is None


def test_parse_args_rejects_legacy_run_flag() -> None:
    with pytest.raises(SystemExit):
        dummy_device._parse_args(['--run', 'dev'])
