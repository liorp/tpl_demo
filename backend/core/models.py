import time
from datetime import datetime
from typing import Literal, NotRequired, TypedDict


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
    unit_a: int
    unit_b: int
    value: int
    threshold: int
    device_ts: NotRequired[int]


class CommLossEvent(TypedDict):
    type: Literal["comm_loss"]
    unit_a: int
    unit_b: int
    no_comm_ms: int
    no_comm_threshold: int
    device_ts: NotRequired[int]


class LinkUpEvent(TypedDict):
    type: Literal["link_up"]
    reporting_unit: int
    linked_unit: int
    rssi: int
    threshold_cfg: int
    gain_cfg: int
    device_ts: NotRequired[int]


class LinkDownEvent(TypedDict):
    type: Literal["link_down"]
    reporting_unit: int
    linked_unit: int
    last_rssi: int
    reason: int
    device_ts: NotRequired[int]


class MapDevEvent(TypedDict):
    type: Literal["map_dev"]
    unit_id: int
    version: str
    voltage: int
    device_ts: NotRequired[int]


class MapLinkEvent(TypedDict):
    type: Literal["map_link"]
    reporting_unit: int
    linked_unit: int
    rssi: int
    threshold: int
    gain: int
    device_ts: NotRequired[int]


class ErrorEvent(TypedDict):
    type: Literal["error"]
    error_number: int
    error_text: str
    device_ts: NotRequired[int]


class TraceEvent(TypedDict):
    type: Literal["trace"]
    text: str
    device_ts: NotRequired[int]


class PingResponseEvent(TypedDict):
    type: Literal["ping_response"]
    unit: int
    round_trip_ms: int
    device_ts: NotRequired[int]


class AntennaEvent(TypedDict):
    type: Literal["antenna"]
    unit: int
    active_antenna: int
    supported_antennas: int
    device_ts: NotRequired[int]


class DetectionModeEvent(TypedDict):
    type: Literal["detection_mode"]
    mode: int
    internal_data: str
    device_ts: NotRequired[int]


Event = (
    DetectionEvent
    | CommLossEvent
    | LinkUpEvent
    | LinkDownEvent
    | MapDevEvent
    | MapLinkEvent
    | ErrorEvent
    | TraceEvent
    | PingResponseEvent
    | AntennaEvent
    | DetectionModeEvent
)


class LogEntry(TypedDict, total=False):
    time: str
    msg: str


class SideLink(TypedDict):
    side1: int
    side2: int
    threshold: int
    gain: int
    rssi: int
    updated_at: int
    dt: NotRequired[int]


class CrossingAlert(TypedDict):
    sensor_a: int
    sensor_b: int
    timestamp: int | None
    value: int
    threshold: int
    lat: float | None
    lng: float | None
    acknowledged: bool


class SensorConfig(TypedDict):
    noise_threshold: int | None
    gain: int | None
    detection_mode: int | None


class UnitPosition(TypedDict):
    id: int | None
    label: str | None
    lat: float
    lng: float


class SensorStatusEntry(TypedDict, total=False):
    last_seen: int
    connected_peers: list[int]
    active_antenna: int
    supported_antennas: int
    version: str
    voltage: int


class PingLatencyEntry(TypedDict):
    round_trip_ms: int
    received_at: float


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
        self.config: SensorConfig = {
            "noise_threshold": None,
            "gain": None,
            "detection_mode": None,
        }
        self.units: list[UnitPosition] = []
        self.sensor_status: dict[str, SensorStatusEntry] = {}
        self.ping_latencies: dict[int, PingLatencyEntry] = {}
        self.map_policy: MapPolicy = dict(DEFAULT_MAP_POLICY)

    def add_log(self, message: str, fields: dict[str, object] | None = None):
        entry: LogEntry = {"time": datetime.now().strftime("%H:%M:%S"), "msg": message}
        if fields:
            for key, value in fields.items():
                if key in ("time", "msg"):
                    continue
                entry[key] = value
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
        "ping_latencies": dict(state.ping_latencies),
        "map_policy": map_policy,
    }


def now_ts() -> float:
    return time.time()
