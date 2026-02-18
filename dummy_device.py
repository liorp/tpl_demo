#!/usr/bin/env python3
"""Dummy TPL Signum device simulator.

Creates a PTY pair and writes scripted protocol messages that the real
backend can consume via SERIAL_PORT=<slave_path>.

Usage:
    python dummy_device.py

Default behavior launches full stack with wired SERIAL_PORT.
Use --run none to disable auto-launch.
"""

import os
import pty
import select
import subprocess
import sys
import threading
import time
from argparse import ArgumentParser, Namespace
from pathlib import Path
import json

# fmt: off
TIMELINE = [
    ( 0, "CMD:CONFIG threshold:50 val:30"),
    ( 1, "CMD:CONNECTED 1001(1) connected:1002(2) 1"),
    ( 2, "CMD:CONNECTED 1002(2) connected:1003(3) 1"),
    ( 3, "CMD:CONNECTED 1003(3) connected:1004(4) 1"),
    ( 4, "CMD:CONNECTED 1004(4) connected:1005(5) 1"),
    ( 6, "CMD:MAP_RSP from 1001 ver:1 gain:3 voltage:36 scan:1 adv:1: 1001(1)>1002(2) q:85 i:72, 1002(2)>1003(3) q:78 i:65"),
    ( 7, "CMD:MAP_RSP from 1003 ver:1 gain:3 voltage:35 scan:1 adv:1: 1003(3)>1004(4) q:90 i:68, 1004(4)>1005(5) q:82 i:70"),
    (10, "CMD:DETECTION 1001(1)-1002(2) th:50 val:65 c:1"),
    (14, "CMD:DETECTION 1003(3)-1004(4) th:50 val:58 c:1"),
    (17, "CMD:DETECTION 1002(2)-1003(3) th:50 val:71 c:2"),
    (20, "CMD:DETECTION-COMM 1004(4)-1005(5) 0"),
    (23, "CMD:CONFIG threshold:45 val:25"),
    (25, "CMD:CONNECTED 1004(4) connected:1005(5) 0"),
    (27, "CMD:DETECTION 1004(4)-1005(5) th:45 val:52 c:1"),
    (28, "CMD:CONNECTED 1004(4) connected:1005(5) 1"),
]
# fmt: on

CYCLE_DURATION = 30  # seconds
DEFAULT_RUN_MODE = "dev"


def build_start_commands(slave_path: str) -> dict[str, str]:
    return {
        "full_stack": f"SERIAL_PORT={slave_path} bun run dev",
        "backend": f"SERIAL_PORT={slave_path} bun run dev:backend",
        "run_full_stack": "python dummy_device.py --run dev",
        "run_backend": "python dummy_device.py --run backend",
    }


def _drain_incoming(master_fd: int, backend_ready: threading.Event | None = None) -> None:
    """Read and discard commands the backend sends (/, cmd, re 3 4)."""
    while True:
        try:
            ready, _, _ = select.select([master_fd], [], [], 0.1)
            if ready:
                data = os.read(master_fd, 1024)
                if backend_ready is not None and data:
                    backend_ready.set()
        except OSError:
            break


def wait_for_backend_ready(backend_ready: threading.Event, timeout_sec: float) -> bool:
    return backend_ready.wait(timeout=timeout_sec)


def _parse_args(argv: list[str] | None = None) -> Namespace:
    parser = ArgumentParser(description="Dummy TPL Signum device simulator")
    parser.add_argument(
        "--run",
        choices=("none", "dev", "backend"),
        default=DEFAULT_RUN_MODE,
        help="Optionally launch stack commands with SERIAL_PORT wired automatically.",
    )
    parser.add_argument(
        "--no-seed-layout",
        action="store_true",
        help="Do not seed backend layout with demo sensors when --run is used.",
    )
    return parser.parse_args(argv)


def launch_stack(mode: str, slave_path: str) -> subprocess.Popen | None:
    if mode == "none":
        return None

    cmd = ["bun", "run", "dev"] if mode == "dev" else ["bun", "run", "dev:backend"]
    env = dict(os.environ)
    env["SERIAL_PORT"] = slave_path
    return subprocess.Popen(cmd, env=env)


def demo_layout_payload() -> dict:
    return {
        "units": [
            {"id": 1, "label": "S1", "lat": 33.3000, "lng": 35.7600},
            {"id": 2, "label": "S2", "lat": 33.3060, "lng": 35.7680},
            {"id": 3, "label": "S3", "lat": 33.3120, "lng": 35.7760},
            {"id": 4, "label": "S4", "lat": 33.3180, "lng": 35.7840},
            {"id": 5, "label": "S5", "lat": 33.3240, "lng": 35.7920},
        ],
        "map_policy": {
            "bounds": {
                "north": 33.44,
                "south": 29.46,
                "east": 35.96,
                "west": 34.19,
            },
            "buffer_km": 10.0,
            "tile_root": "/tiles",
            "offline_required": True,
        },
    }


def prepare_layout_state(layout_state_path: Path) -> str | None:
    original: str | None = None
    if layout_state_path.exists():
        original = layout_state_path.read_text()
    layout_state_path.parent.mkdir(parents=True, exist_ok=True)
    layout_state_path.write_text(json.dumps(demo_layout_payload(), indent=2))
    return original


def restore_layout_state(layout_state_path: Path, original: str | None) -> None:
    if original is None:
        if layout_state_path.exists():
            layout_state_path.unlink()
        return
    layout_state_path.write_text(original)


def main() -> None:
    args = _parse_args()
    master_fd, slave_fd = pty.openpty()
    slave_path = os.ttyname(slave_fd)
    commands = build_start_commands(slave_path)
    layout_state_path = Path(__file__).resolve().parent / "backend" / "data" / "layout_state.json"
    original_layout: str | None = None
    seeded_layout = args.run != "none" and not args.no_seed_layout
    if seeded_layout:
        original_layout = prepare_layout_state(layout_state_path)
    child = launch_stack(args.run, slave_path)

    print(f"Dummy device ready on:  {slave_path}")
    print(f"Start full stack with:  {commands['full_stack']}")
    print(f"Backend only:           {commands['backend']}")
    print(f"No-env full stack:      {commands['run_full_stack']}")
    print(f"No-env backend only:    {commands['run_backend']}")
    if seeded_layout:
        print(f"Seeded demo layout:     {layout_state_path}")
    if child:
        mode = "full stack" if args.run == "dev" else "backend only"
        print(f"Launched {mode} (pid {child.pid}) with SERIAL_PORT={slave_path}")
    print()

    backend_ready = threading.Event() if child else None
    threading.Thread(
        target=_drain_incoming, args=(master_fd, backend_ready), daemon=True
    ).start()

    device_ts = 1000
    cycle = 0

    try:
        if child and backend_ready and wait_for_backend_ready(backend_ready, timeout_sec=10):
            print("Backend handshake detected; starting timeline.")
        elif child:
            print("Backend handshake timeout; starting timeline anyway.")
        while True:
            cycle += 1
            print(f"--- cycle {cycle} ---")

            prev_offset = 0
            for offset, payload in TIMELINE:
                if child and child.poll() is not None:
                    raise KeyboardInterrupt
                delta = offset - prev_offset
                if delta > 0:
                    time.sleep(delta)
                prev_offset = offset

                line = f"[{device_ts}] I {payload}\r\n"
                device_ts += 1

                os.write(master_fd, line.encode())
                print(f"  [{offset:2d}s] {payload}")

            remaining = CYCLE_DURATION - prev_offset
            if remaining > 0:
                time.sleep(remaining)

    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if child and child.poll() is None:
            child.terminate()
        if seeded_layout:
            restore_layout_state(layout_state_path, original_layout)
        os.close(master_fd)
        os.close(slave_fd)


if __name__ == "__main__":
    main()
