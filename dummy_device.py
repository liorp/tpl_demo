#!/usr/bin/env python3
"""Dummy TPL Signum device simulator.

Creates a PTY pair and writes scripted AT-Commands protocol messages that the
real backend can consume via SERIAL_PORT=<slave_path>. Also responds to AT
command requests sent by the backend (handshake, map refresh, ping, antenna,
detection mode, reset).
"""

import errno
import fcntl
import os
import pty
import re
import select
import threading
import time
from argparse import ArgumentParser, Namespace

DUMMY_VERSION = "0.10b219"

# Scripted unsolicited events. Each entry runs at `offset` seconds in the cycle.
# fmt: off
TIMELINE = [
    ( 1, "#EVTMESHMAPDEV=1,\"SG_0_10b19\",3000,00000000"),
    ( 1, "#EVTMESHMAPDEV=10,\"SG_0_10b19\",3015,00000000"),
    ( 1, "#EVTMESHMAPDEV=11,\"SG_0_10b19\",2926,00000000"),
    ( 2, "#EVTMESHMAPDEVLINK=10,11,-27,300,64,00000000"),
    ( 2, "#EVTMESHMAPDEVLINK=11,10,-28,300,64,00000000"),
    ( 2, "#EVTMESHMAPDEVLINK=10,1,-33,0,0,00000000"),
    ( 2, "#EVTMESHMAPDEVLINK=11,1,-41,0,0,00000000"),
    ( 4, "#EVTMESHLINKUP=10,11,0,300,64,00000000"),
    ( 4, "#EVTMESHLINKUP=11,10,0,300,64,00000000"),
    (10, "#EVTDETECT=10,11,555,300"),
    (14, "#EVTDETECT=11,10,612,300"),
    (17, "#EVTDETECT=10,11,701,300"),
    (20, "#EVTDETCOM=10,11,2025,2000"),
    (24, "#EVTDETECT=10,11,640,300"),
    (28, "#EVTACTANT=10,1,3"),
]
# fmt: on

CYCLE_DURATION = 32  # seconds


def build_start_commands(slave_path: str) -> dict[str, str]:
    return {
        "backend": f"SERIAL_PORT={slave_path} bun run dev:backend",
        "frontend": "bun run dev:frontend",
        "run_backend": "bun run dev:backend",
        "run_frontend": "bun run dev:frontend",
    }


PORT_FILE = "/tmp/tpl-dummy-port"


def _parse_args(argv: list[str] | None = None) -> Namespace:
    parser = ArgumentParser(description="Dummy TPL Signum device simulator")
    parser.add_argument(
        "--port-file",
        default=None,
        help="Write the slave PTY path to this file (default: none)",
    )
    return parser.parse_args(argv)


def _safe_write(master_fd: int, payload: str, lock: threading.Lock) -> None:
    with lock:
        try:
            os.write(master_fd, payload.encode())
        except OSError as e:
            if e.errno != errno.EAGAIN:
                raise


_AT_PATTERN = re.compile(r"^AT(#[A-Z0-9]+)(?:[=?](.*))?$")


def _build_replies(command: str) -> list[str]:
    """Return one or more lines (without trailing terminators) to reply with."""
    cmd = command.strip()
    if not cmd:
        return []
    match = _AT_PATTERN.match(cmd)
    if not match:
        return []
    tag, args = match.group(1), match.group(2) or ""
    if tag == "#GETVERSION":
        return [f"#GETVERSION:{DUMMY_VERSION}", "OK"]
    if tag == "#REQMESHMAP":
        return [
            "OK",
            "#EVTMESHMAPDEV=10,\"SG_0_10b19\",3015,00000000",
            "#EVTMESHMAPDEVLINK=10,11,-27,300,64,00000000",
            "#EVTMESHMAPDEV=11,\"SG_0_10b19\",2926,00000000",
            "#EVTMESHMAPDEVLINK=11,10,-28,300,64,00000000",
        ]
    if tag == "#PING":
        unit = args or "0"
        return ["OK", "#PINGRSP=10,160", "#PINGRSP=11,232"] if unit.strip() == "0" else [
            "OK",
            f"#PINGRSP={unit.strip()},180",
        ]
    if tag == "#REQACTANT":
        return ["OK", "#EVTACTANT=10,1,3", "#EVTACTANT=11,1,3"]
    if tag == "#SETACTANT":
        parts = [p.strip() for p in args.split(",") if p.strip()]
        if len(parts) >= 2:
            return ["OK", f"#EVTACTANT={parts[0]},{parts[1]},3"]
        return ["ERROR"]
    if tag == "#REQDETMODE":
        return ["OK", "#EVTDETMODE=1,"]
    if tag == "#SETDETMODE":
        parts = [p.strip() for p in args.split(",")]
        if parts and parts[0]:
            return ["OK", f"#EVTDETMODE={parts[0]},"]
        return ["ERROR"]
    if tag == "#SETDETTHR":
        return ["OK"]
    if tag == "#SETDETGAIN":
        return ["OK"]
    if tag == "#RESET":
        return ["OK", "ATCMD_CLI_READY"]
    return ["OK"]


def _command_responder(master_fd: int, write_lock: threading.Lock) -> None:
    buffer = ""
    while True:
        try:
            ready, _, _ = select.select([master_fd], [], [], 0.1)
        except OSError:
            return
        if not ready:
            continue
        try:
            data = os.read(master_fd, 1024)
        except OSError as e:
            if e.errno == errno.EAGAIN:
                continue
            return
        if not data:
            return
        buffer += data.decode("utf-8", errors="replace")
        # commands end in CR, but tolerate LF too
        for terminator in ("\r\n", "\n", "\r"):
            buffer = buffer.replace(terminator, "\r")
        while "\r" in buffer:
            command, _, buffer = buffer.partition("\r")
            replies = _build_replies(command)
            for reply in replies:
                _safe_write(master_fd, reply + "\r\n", write_lock)


def main() -> None:
    args = _parse_args()
    master_fd, slave_fd = pty.openpty()
    flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    slave_path = os.ttyname(slave_fd)
    commands = build_start_commands(slave_path)

    if args.port_file:
        with open(args.port_file, "w") as f:
            f.write(slave_path)

    print(f"Dummy device ready on:  {slave_path}")
    print(f"Run backend with:       {commands['backend']}")
    print(f"Run frontend with:      {commands['frontend']}")
    print(f"Or backend command:     {commands['run_backend']}")
    print(f"Or frontend command:    {commands['run_frontend']}")
    print()

    write_lock = threading.Lock()
    threading.Thread(
        target=_command_responder,
        args=(master_fd, write_lock),
        daemon=True,
    ).start()

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

                _safe_write(master_fd, payload + "\r\n", write_lock)
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
