import time
from datetime import datetime
from typing import Literal, TypedDict


class GeoBounds(TypedDict):
    north: float
    south: float
    east: float
    west: float


class MapPolicy(TypedDict):
    bounds: GeoBounds | None
    buffer_km: float | None
    tile_root: str | None
    offline_required: bool


DEFAULT_MAP_POLICY: MapPolicy = {
    "bounds": None,
    "buffer_km": None,
    "tile_root": None,
    "offline_required": False,
}


class DetectionEvent(TypedDict):
    type: Literal["detection"]
    id_a: str
    unit_a: int
    id_b: str
    unit_b: int
    threshold: int
    value: int
    count: int
    device_ts: int


class CommLossEvent(TypedDict):
    type: Literal["comm_loss"]
    id_a: str
    unit_a: int
    id_b: str
    unit_b: int
    value: int
    device_ts: int


class ConnectedEvent(TypedDict):
    type: Literal["connected"]
    id_unit: str
    unit: int
    id_peer: str
    peer: int
    connected: bool
    device_ts: int


class MapEvent(TypedDict):
    type: Literal["map"]
    unit_id: int
    version: str
    gain: int
    voltage: int
    links: list[dict[str, int]]
    device_ts: int


class ConfigEvent(TypedDict):
    type: Literal["config"]
    threshold: int
    value: int
    device_ts: int


Event = DetectionEvent | CommLossEvent | ConnectedEvent | MapEvent | ConfigEvent


class LogEntry(TypedDict):
    time: str
    msg: str


class SideLink(TypedDict):
    side1: int
    side2: int
    threshold: int
    rssi: int
    dt: int


class CrossingAlert(TypedDict):
    sensor_a: int
    sensor_b: int
    timestamp: int | None
    lat: float | None
    lng: float | None
    acknowledged: bool


class SensorConfig(TypedDict):
    gain: int | None


class UnitPosition(TypedDict):
    id: int | None
    label: str | None
    lat: float
    lng: float


class SensorStatusEntry(TypedDict):
    last_seen: int
    connected_peers: list[int]


class SensorState:
    def __init__(self):
        self.serial_connected = False
        self.current_port = "None"
        self.alarm_state = "disconnected"
        self.last_detection_time = 0.0
        self.logs: list[LogEntry] = []
        self.max_logs = 50
        self.links: list[SideLink] = []
        self.crossing_alert: CrossingAlert | None = None
        self.config: SensorConfig = {"gain": None}
        self.units: list[UnitPosition] = []
        self.sensor_status: dict[str, SensorStatusEntry] = {}
        self.map_policy: MapPolicy = dict(DEFAULT_MAP_POLICY)

    def add_log(self, message: str):
        entry: LogEntry = {"time": datetime.now().strftime("%H:%M:%S"), "msg": message}
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
