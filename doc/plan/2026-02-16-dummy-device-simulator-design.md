# Dummy Device Simulator — Design

## Purpose

A standalone Python script that emulates the physical TPL Signum device over a PTY pair. Used for:

- **Live demos** without real hardware
- **Frontend/backend development** without a physical device plugged in

The real backend connects to it via `SERIAL_PORT` and cannot tell the difference — the full pipeline (serial read → parse → handle_event → broadcast → frontend) runs as normal.

## Architecture

```
┌──────────────┐    PTY pair    ┌──────────────┐
│ dummy_device  │──────────────▶│   backend    │
│  (writes      │  /dev/pts/X   │ SerialManager │
│   protocol    │               │  reads lines  │
│   strings)    │               │  as normal    │
└──────────────┘               └──────────────┘
```

1. Script creates a PTY pair using Python's `pty` module
2. Prints the slave PTY path to stdout
3. Backend starts with `SERIAL_PORT=<path> bun run dev:backend`
4. Script loops through a scripted timeline, writing raw protocol lines to the master fd
5. After ~30s the cycle restarts

## Scripted Timeline (~30 seconds)

5 sensors in a chain: `1001(A)`, `1002(B)`, `1003(C)`, `1004(D)`, `1005(E)`

| Time | Event Type   | Payload                                                                                     | UI Effect                          |
|------|-------------|---------------------------------------------------------------------------------------------|------------------------------------|
| 0s   | config      | `CMD:CONFIG threshold:50 val:30`                                                            | Config populates                   |
| 1s   | connected   | `CMD:CONNECTED 1001(A) connected:1002(B) 1`                                                 | Pair A-B links up                  |
| 2s   | connected   | `CMD:CONNECTED 1002(B) connected:1003(C) 1`                                                 | Pair B-C links up                  |
| 3s   | connected   | `CMD:CONNECTED 1003(C) connected:1004(D) 1`                                                 | Pair C-D links up                  |
| 4s   | connected   | `CMD:CONNECTED 1004(D) connected:1005(E) 1`                                                 | Pair D-E links up                  |
| 6s   | map         | `CMD:MAP_RSP from 1001 ver:1 gain:3 voltage:36 scan:1 adv:1: 1001(A)>1002(B) q:85 i:72, 1002(B)>1003(C) q:78 i:65` | Signal matrix fills    |
| 7s   | map         | `CMD:MAP_RSP from 1003 ver:1 gain:3 voltage:35 scan:1 adv:1: 1003(C)>1004(D) q:90 i:68, 1004(D)>1005(E) q:82 i:70` | More links appear      |
| 10s  | detection   | `CMD:DETECTION 1001(A)-1002(B) th:50 val:65 c:1`                                            | Alarm on A-B                       |
| 14s  | detection   | `CMD:DETECTION 1003(C)-1004(D) th:50 val:58 c:1`                                            | Second crossing on C-D             |
| 17s  | detection   | `CMD:DETECTION 1002(B)-1003(C) th:50 val:71 c:2`                                            | Third crossing on B-C, high value  |
| 20s  | comm_loss   | `CMD:DETECTION-COMM 1004(D)-1005(E) 0`                                                      | Comm loss on D-E                   |
| 23s  | config      | `CMD:CONFIG threshold:45 val:25`                                                             | Config changes                     |
| 25s  | connected   | `CMD:CONNECTED 1004(D) connected:1005(E) 0`                                                 | D-E disconnects                    |
| 27s  | detection   | `CMD:DETECTION 1004(D)-1005(E) th:45 val:52 c:1`                                            | Detection on recovering pair       |
| 28s  | connected   | `CMD:CONNECTED 1004(D) connected:1005(E) 1`                                                 | D-E reconnects                     |
| 30s  | *loop*      | —                                                                                           | Cycle restarts                     |

Narrative: system boots → healthy monitoring → multiple intrusions → perimeter trouble → recovery.

## Implementation

**File:** `backend/dummy_device.py`

**Dependencies:** Python stdlib only (`pty`, `os`, `time`, `sys`)

**Usage:**
```bash
# Terminal 1
python backend/dummy_device.py
# Output: Connect backend with: SERIAL_PORT=/dev/ttys003

# Terminal 2
SERIAL_PORT=/dev/ttys003 bun run dev:backend
```

**Details:**

- Each line written with `[<timestamp>] I ` prefix and `\r\n` terminator, matching real device output
- Device timestamps increment realistically across the loop
- The script reads and discards incoming commands from the backend (init sequence: `/`, `cmd`, `re 3 4`) so the backend doesn't block on write
- Ctrl+C to stop
- Single file, no config, no external dependencies

**Scope boundaries — the script does NOT:**

- Provide interactive event triggers (scripted playback only)
- Have its own web UI or API
- Modify any existing backend code
