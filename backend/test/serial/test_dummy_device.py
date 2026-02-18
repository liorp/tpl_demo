import os
from pathlib import Path
import threading

import dummy_device
from dummy_device import build_start_commands


def test_build_start_commands_includes_serial_port_for_backend_and_full_stack() -> None:
    commands = build_start_commands('/dev/ttys027')

    assert commands['backend'] == 'SERIAL_PORT=/dev/ttys027 bun run dev:backend'
    assert commands['full_stack'] == 'SERIAL_PORT=/dev/ttys027 bun run dev'


def test_build_start_commands_includes_no_env_user_commands() -> None:
    commands = build_start_commands('/dev/ttys027')

    assert commands['run_backend'] == 'python dummy_device.py --run backend'
    assert commands['run_full_stack'] == 'python dummy_device.py --run dev'


def test_launch_stack_sets_serial_port(monkeypatch) -> None:
    captured: dict = {}

    class FakeProcess:
        pid = 1234

    def fake_popen(cmd, env):
        captured['cmd'] = cmd
        captured['env'] = env
        return FakeProcess()

    monkeypatch.setattr(dummy_device.subprocess, 'Popen', fake_popen)
    process = dummy_device.launch_stack('dev', '/dev/ttys027')

    assert process.pid == 1234
    assert captured['cmd'] == ['bun', 'run', 'dev']
    assert captured['env']['SERIAL_PORT'] == '/dev/ttys027'
    assert captured['env'].get('PATH') == os.environ.get('PATH')


def test_demo_layout_payload_has_expected_units() -> None:
    payload = dummy_device.demo_layout_payload()

    unit_ids = [unit['id'] for unit in payload['units']]
    assert unit_ids == [1, 2, 3, 4, 5]
    assert payload['map_policy']['offline_required'] is True


def test_prepare_and_restore_layout_state_round_trip(tmp_path: Path) -> None:
    layout_path = tmp_path / 'layout_state.json'
    layout_path.parent.mkdir(parents=True, exist_ok=True)
    layout_path.write_text('{"units":[{"id":77}],"map_policy":{"offline_required":true}}')

    original = dummy_device.prepare_layout_state(layout_path)
    written = layout_path.read_text()
    assert '"id": 1' in written
    assert '"id": 5' in written

    dummy_device.restore_layout_state(layout_path, original)
    assert layout_path.read_text() == '{"units":[{"id":77}],"map_policy":{"offline_required":true}}'


def test_parse_args_defaults_to_running_full_stack() -> None:
    args = dummy_device._parse_args([])
    assert args.run == 'dev'
    assert args.no_seed_layout is False


def test_parse_args_can_disable_auto_run() -> None:
    args = dummy_device._parse_args(['--run', 'none'])
    assert args.run == 'none'


def test_wait_for_backend_ready_returns_true_when_event_is_set() -> None:
    ready = threading.Event()
    ready.set()
    assert dummy_device.wait_for_backend_ready(ready, timeout_sec=0.01) is True


def test_wait_for_backend_ready_times_out_when_event_not_set() -> None:
    ready = threading.Event()
    assert dummy_device.wait_for_backend_ready(ready, timeout_sec=0.01) is False
