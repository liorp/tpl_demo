#!/usr/bin/env bash
# Wait for the dummy device to write its PTY path, then start the backend.
PORT_FILE=/tmp/tpl-dummy-port
while [ ! -s "$PORT_FILE" ]; do sleep 0.1; done
export SERIAL_PORT
SERIAL_PORT=$(cat "$PORT_FILE")
exec bun run dev:backend
