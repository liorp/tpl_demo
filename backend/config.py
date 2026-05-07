import os
from pathlib import Path

SERIAL_PORT = os.getenv("SERIAL_PORT", "").strip()
LAYOUT_STATE_PATH = os.getenv("LAYOUT_STATE_PATH", "").strip()
BACKEND_PORT = int(os.getenv("TPL_BACKEND_PORT", "8181"))
BAUD_RATE = 57600
AUTO_RESET_TIMEOUT = 4.0
APP_LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "INFO").strip().upper() or "INFO"
APP_LOG_FILE = os.getenv("APP_LOG_FILE", "").strip() or str(
    Path(__file__).resolve().parent / "data" / "app.log"
)
APP_LOG_MAX_BYTES = int(os.getenv("APP_LOG_MAX_BYTES", "1048576"))
APP_LOG_BACKUP_COUNT = int(os.getenv("APP_LOG_BACKUP_COUNT", "5"))
