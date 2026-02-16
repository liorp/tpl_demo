import os

SERIAL_PORT = os.getenv("SERIAL_PORT", "").strip()
BAUD_RATE = 57600
AUTO_RESET_TIMEOUT = 4.0
