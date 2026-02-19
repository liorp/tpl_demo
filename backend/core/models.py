import threading
import time
from datetime import datetime
from typing import TypedDict

import serial


class MapPolicy(TypedDict):
    bounds: dict | None
    buffer_km: float | None
    tile_root: str | None
    offline_required: bool


DEFAULT_MAP_POLICY: MapPolicy = {
    "bounds": None,
    "buffer_km": None,
    "tile_root": None,
    "offline_required": False,
}


class Event(TypedDict, total=False):
    type: str
    id_a: str
    unit_a: int
    id_b: str
    unit_b: int
    threshold: int
    value: int
    count: int
    id_unit: str
    unit: int
    id_peer: str
    peer: int
    connected: bool
    unit_id: int
    version: str
    gain: int
    voltage: int
    links: list[dict[str, int]]
    side1: int
    side2: int
    quality: int
    intensity: int
    sensor_a: int
    sensor_b: int
    device_ts: int


class SensorState:
    def __init__(self):
        self.serial_connected = False
        self.current_port = "None"
        self.alarm_state = "disconnected"
        self.last_detection_time = 0.0
        self.logs: list[dict] = []
        self.max_logs = 50
        self.links: list[dict] = []
        self.crossing_alert: dict | None = None
        self.config = {"threshold": None, "val": None}
        self.units: list[dict] = []
        self.sensor_status: dict = {}
        self.map_policy: MapPolicy = dict(DEFAULT_MAP_POLICY)

        self._log_lock = threading.Lock()
        self.serial_lock = threading.Lock()
        self.serial_conn: serial.Serial | None = None

    def add_log(self, message: str):
        entry = {"time": datetime.now().strftime("%H:%M:%S"), "msg": message}
        with self._log_lock:
            self.logs.insert(0, entry)
            if len(self.logs) > self.max_logs:
                self.logs.pop()


def snapshot(state: SensorState) -> dict:
    map_policy: MapPolicy = {
        **DEFAULT_MAP_POLICY,
        **dict(state.map_policy),
    }
    return {
        "connected": state.serial_connected,
        "port": state.current_port,
        "alarm": state.alarm_state,
        "events": list(state.logs),
        "links": list(state.links),
        "crossing_alert": dict(state.crossing_alert) if state.crossing_alert else None,
        "config": dict(state.config),
        "units": list(state.units),
        "sensor_status": dict(state.sensor_status),
        "map_policy": map_policy,
    }


def now_ts() -> float:
    return time.time()
