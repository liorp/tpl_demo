import os

SERIAL_PORT = os.getenv("SERIAL_PORT", "").strip()
LAYOUT_STATE_PATH = os.getenv("LAYOUT_STATE_PATH", "").strip()
BAUD_RATE = 57600
AUTO_RESET_TIMEOUT = 4.0
