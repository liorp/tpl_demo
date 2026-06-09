import os
from pathlib import Path

SERIAL_PORT = os.getenv("SERIAL_PORT", "").strip()
LAYOUT_STATE_PATH = os.getenv("LAYOUT_STATE_PATH", "").strip()
BACKEND_PORT = int(os.getenv("TPL_BACKEND_PORT", "8181"))
BAUD_RATE = 57600

# Detection defaults applied to the device on each connect ("boot"). Mode is
# global; gain/threshold are per-pair and only applied to links the device
# still reports as unconfigured (0), so manual tuning survives reconnects.
DEFAULT_DETECTION_MODE = int(os.getenv("DEFAULT_DETECTION_MODE", "1"))
DEFAULT_DETECTION_GAIN = int(os.getenv("DEFAULT_DETECTION_GAIN", "32"))
DEFAULT_DETECTION_THRESHOLD = int(os.getenv("DEFAULT_DETECTION_THRESHOLD", "300"))
APP_LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "INFO").strip().upper() or "INFO"
APP_LOG_FILE = os.getenv("APP_LOG_FILE", "").strip() or str(
    Path(__file__).resolve().parent / "data" / "app.log"
)
APP_LOG_MAX_BYTES = int(os.getenv("APP_LOG_MAX_BYTES", "1048576"))
APP_LOG_BACKUP_COUNT = int(os.getenv("APP_LOG_BACKUP_COUNT", "5"))
