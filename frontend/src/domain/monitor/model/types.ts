export type AlarmState = 'clear' | 'alarm' | 'comm_loss' | 'disconnected';

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
  rssi: number;
  dt: number;
  updatedAt: number;
};

export type CrossingAlert = {
  sensorA: number;
  sensorB: number;
  at: number;
  lat: number | null;
  lng: number | null;
  acknowledged: boolean;
};

export type CrossingAckWindow = {
  sensorA: number;
  sensorB: number;
  at: number;
};

export type MonitorConfig = {
  gain: number | null;
};

export type GlobalSettings = {
  alarmSoundEnabled: boolean;
  offlineModeEnabled: boolean;
};

export type SensorStatus = {
  lastSeen: number | null;
  connectedPeers: number[];
};

export type SensorStatusMap = Record<string, SensorStatus>;

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
  lat?: unknown;
  lng?: unknown;
  acknowledged?: unknown;
};

export type MonitorPayload = {
  connected: boolean;
  port: string;
  alarm: AlarmState;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossing_alert: BackendCrossingAlert | null;
  config: MonitorConfig;
  units?: UnitPlacement[];
  sensor_status?: Record<string, BackendSensorStatus>;
  map_policy?: BackendMapPolicy;
};

export type ServerState = {
  serverOnline: boolean;
  connected: boolean;
  port: string;
  alarm: AlarmState;
  events: MonitorEvent[];
  links: SignalLinkState[];
  config: MonitorConfig;
  sensorStatus: SensorStatusMap;
  mapPolicy: MapPolicy;
};

export type MonitorState = {
  serverOnline: boolean;
  connected: boolean;
  port: string;
  alarm: AlarmState;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossingAlerts: CrossingAlert[];
  config: MonitorConfig;
  globalSettings: GlobalSettings;
  units: UnitPlacement[];
  pairings: PairLink[];
  sensorStatus: SensorStatusMap;
  mapPolicy: MapPolicy;
};
