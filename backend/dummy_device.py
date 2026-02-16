#!/usr/bin/env python3
"""Dummy TPL Signum device simulator.

Creates a PTY pair and writes scripted protocol messages that the real
backend can consume via SERIAL_PORT=<slave_path>.

Usage:
    python backend/dummy_device.py

Then in another terminal:
    SERIAL_PORT=<printed path> bun run dev:backend
"""

import os
import pty
import select
import sys
import threading
import time

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


def _drain_incoming(master_fd: int) -> None:
    """Read and discard commands the backend sends (/, cmd, re 3 4)."""
    while True:
        try:
            ready, _, _ = select.select([master_fd], [], [], 0.1)
            if ready:
                os.read(master_fd, 1024)
        except OSError:
            break


def main() -> None:
    master_fd, slave_fd = pty.openpty()
    slave_path = os.ttyname(slave_fd)

    print(f"Dummy device ready on:  {slave_path}")
    print(f"Start backend with:     SERIAL_PORT={slave_path} bun run dev:backend")
    print()

    threading.Thread(target=_drain_incoming, args=(master_fd,), daemon=True).start()

    device_ts = 1000
    cycle = 0

    try:
        while True:
            cycle += 1
            print(f"--- cycle {cycle} ---")

            prev_offset = 0
            for offset, payload in TIMELINE:
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
        os.close(master_fd)
        os.close(slave_fd)


if __name__ == "__main__":
    main()
