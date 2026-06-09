import type { Annotation } from './annotations';

export type MonitorEvent = {
  time: string;
  msg: string;
} & Record<string, unknown>;

export type UnitPlacement = {
  id: number;
  label: string;
  lat: number;
  lng: number;
  status?: 'active' | 'inactive' | 'stale';
  lastSeenAt?: number;
};

export type PairLink = {
  side1Id: number;
  side2Id: number;
  enabled: boolean;
};

export type SignalLinkState = {
  side1: number;
  side2: number;
  threshold: number;
  gain: number;
  rssi: number;
  dt: number;
  updatedAt: number;
};

export type CrossingAlert = {
  sensorA: number;
  sensorB: number;
  at: number;
  value?: number;
  threshold?: number;
  lat: number | null;
  lng: number | null;
  acknowledged: boolean;
};

export type DetectionMode = 1 | 2;

export type MonitorConfig = {
  noise_threshold?: number | null;
  gain: number | null;
  detection_mode?: DetectionMode | null;
};

export type GlobalSettings = {
  alarmSoundEnabled: boolean;
  offlineModeEnabled: boolean;
};

export type AntennaMode = 1 | 2;

export type SensorStatus = {
  lastSeen: number | null;
  connectedPeers: number[];
  activeAntenna?: AntennaMode | null;
  supportedAntennas?: number | null;
  voltage?: number | null;
  version?: string | null;
};

export type SensorStatusMap = Record<string, SensorStatus>;

export type PingLatency = {
  unit: number;
  roundTripMs: number;
  receivedAt: number;
};

export type PingLatencyMap = Record<string, PingLatency>;

export type MapBounds = {
  north: number;
  south: number;
  west: number;
  east: number;
};

export type MapPolicy = {
  bounds: MapBounds | null;
  bufferKm: number | null;
  tileRoot: string | null;
  offlineRequired: boolean;
};

export type BackendSensorStatus = {
  last_seen?: unknown;
  connected_peers?: unknown;
  active_antenna?: unknown;
  supported_antennas?: unknown;
  voltage?: unknown;
  version?: unknown;
};

export type BackendPingLatency = {
  round_trip_ms?: unknown;
  received_at?: unknown;
};

export type BackendMapPolicy = {
  bounds?: unknown;
  buffer_km?: unknown;
  tile_root?: unknown;
  offline_required?: unknown;
};

export type BackendCrossingAlert = {
  sensor_a?: unknown;
  sensor_b?: unknown;
  timestamp?: unknown;
  value?: unknown;
  threshold?: unknown;
  lat?: unknown;
  lng?: unknown;
  acknowledged?: unknown;
};

export type MonitorPayload = {
  connected: boolean;
  port: string;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossing_alert: BackendCrossingAlert | null;
  config: MonitorConfig;
  units?: UnitPlacement[];
  sensor_status?: Record<string, BackendSensorStatus>;
  ping_latencies?: Record<string, BackendPingLatency>;
  map_policy?: BackendMapPolicy;
};

export type ServerState = {
  serverOnline: boolean;
  connected: boolean;
  port: string;
  events: MonitorEvent[];
  links: SignalLinkState[];
  config: MonitorConfig;
  sensorStatus: SensorStatusMap;
  pingLatencies: PingLatencyMap;
  mapPolicy: MapPolicy;
};

export type MonitorState = {
  serverOnline: boolean;
  connected: boolean;
  port: string;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossingAlerts: CrossingAlert[];
  config: MonitorConfig;
  globalSettings: GlobalSettings;
  units: UnitPlacement[];
  pairings: PairLink[];
  annotations: Annotation[];
  sensorStatus: SensorStatusMap;
  pingLatencies: PingLatencyMap;
  mapPolicy: MapPolicy;
};
