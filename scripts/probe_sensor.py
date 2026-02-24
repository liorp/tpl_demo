#!/usr/bin/env python3
"""
Probe script for TPL USB sensor.

Detects the sensor on a serial port, runs the initialization sequence,
streams incoming data for a few seconds, and optionally sends test commands.

Usage:
    python scripts/probe_sensor.py                  # auto-detect port
    python scripts/probe_sensor.py /dev/cu.usbserial-0001  # explicit port
    python scripts/probe_sensor.py --interactive    # enter commands manually
"""

import argparse
import re
import sys
import time

import serial
import serial.tools.list_ports

BAUD_RATE = 57600
ANSI_RE = re.compile(r'\x1b\[[0-9;]*m')
TIMESTAMP_RE = re.compile(r'^\[(\d+)\]\s+I\s+(.*)')

INIT_SEQUENCE = [
    ('/', 'reset/flush'),
    ('cmd', 'list commands'),
    ('re 3 4', 'set report mode'),
    ('/', 'reset again'),
    ('mpedT', 'enable measurement mode'),
    ('map', 'request network map'),
]

TEST_COMMANDS = [
    ('map', 'request network map'),
    ('cmd', 'list available commands'),
]


def find_sensor_port(forced: str | None = None) -> str | None:
    if forced:
        return forced
    ports = [p.device for p in serial.tools.list_ports.comports()]
    for port in ports:
        low = port.lower()
        if 'bluetooth' in low:
            continue
        if 'usb' in low or 'acm' in low or 'ttyusb' in low:
            return port
    return None


def send(ser: serial.Serial, cmd: str):
    ser.write((cmd + '\r').encode())


def read_lines(ser: serial.Serial, timeout: float = 3.0) -> list[str]:
    lines: list[str] = []
    buffer = ''
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = ser.read(ser.in_waiting or 1)
        if not data:
            continue
        buffer += data.decode('utf-8', errors='replace')
        while '\n' in buffer:
            line, buffer = buffer.split('\n', 1)
            clean = ANSI_RE.sub('', line).strip()
            if clean:
                lines.append(clean)
    return lines


def probe(port: str, interactive: bool = False):
    print(f'\n--- Connecting to {port} at {BAUD_RATE} baud ---\n')
    try:
        ser = serial.Serial(
            port,
            BAUD_RATE,
            timeout=1,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            xonxoff=False,
            rtscts=False,
        )
    except serial.SerialException as e:
        print(f'ERROR: Could not open {port}: {e}')
        return False

    time.sleep(1.0)
    ser.reset_input_buffer()

    # --- Initialization sequence ---
    print('=== Initialization Sequence ===')
    for cmd, desc in INIT_SEQUENCE:
        print(f'  > {cmd:10s}  ({desc})')
        send(ser, cmd)
        time.sleep(0.5)

    # --- Read initial responses ---
    print('\n=== Reading sensor output (5s) ===')
    lines = read_lines(ser, timeout=5.0)
    protocol_ok = False
    for line in lines:
        ts = TIMESTAMP_RE.match(line)
        tag = '[PROTO] ' if ts else '        '
        if ts:
            protocol_ok = True
        print(f'  {tag}{line}')

    if protocol_ok:
        print('\n  Protocol VALIDATED - sensor is responding with timestamped events.')
    else:
        print('\n  WARNING: No timestamped protocol events received.')
        print('  The device may not be a TPL sensor, or it may need more time.')

    # --- Test commands ---
    print('\n=== Test Commands ===')
    for cmd, desc in TEST_COMMANDS:
        print(f'\n  Sending: {cmd}  ({desc})')
        send(ser, cmd)
        time.sleep(0.5)
        resp = read_lines(ser, timeout=2.0)
        if resp:
            for line in resp:
                print(f'    < {line}')
        else:
            print('    (no response)')

    # --- Interactive mode ---
    if interactive:
        print('\n=== Interactive Mode (type commands, Ctrl-C to exit) ===')
        try:
            while True:
                cmd = input('\n  cmd> ').strip()
                if not cmd:
                    continue
                send(ser, cmd)
                time.sleep(0.3)
                resp = read_lines(ser, timeout=2.0)
                if resp:
                    for line in resp:
                        print(f'    < {line}')
                else:
                    print('    (no response)')
        except (KeyboardInterrupt, EOFError):
            print('\n  Exiting interactive mode.')

    ser.close()
    print(f'\n--- Connection closed ---\n')
    return protocol_ok


def main():
    parser = argparse.ArgumentParser(description='Probe TPL USB sensor')
    parser.add_argument('port', nargs='?', help='Serial port (auto-detected if omitted)')
    parser.add_argument('--interactive', '-i', action='store_true', help='Enter interactive command mode after probe')
    args = parser.parse_args()

    # List all serial ports
    print('=== Available Serial Ports ===')
    all_ports = serial.tools.list_ports.comports()
    if not all_ports:
        print('  (none)')
    for p in all_ports:
        bt = ' [bluetooth - skipped]' if 'bluetooth' in p.device.lower() else ''
        print(f'  {p.device}  -  {p.description}{bt}')

    port = find_sensor_port(args.port)
    if not port:
        print('\nERROR: No USB serial port found. Is the sensor plugged in?')
        sys.exit(1)

    print(f'\n  Selected port: {port}')
    ok = probe(port, interactive=args.interactive)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
