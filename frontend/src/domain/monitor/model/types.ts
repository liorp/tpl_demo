export type AlarmState = 'clear' | 'alarm' | 'comm_loss' | 'disconnected';

export type MonitorEvent = {
  time: string;
  msg: string;
};

export type UnitPlacement = {
  id: number;
  label: string;
  lat: number;
  lng: number;
  status?: 'active' | 'inactive';
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
  quality: number;
  intensity: number;
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
  threshold: number | null;
  val: number | null;
};

export type GlobalSettings = {
  alarmSoundEnabled: boolean;
};

export type SensorStatus = {
  active: boolean;
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
  active?: unknown;
  last_seen?: unknown;
  connected_peers?: unknown;
};

export type BackendMapPolicy = {
  bounds?: unknown;
  buffer_km?: unknown;
  tile_root?: unknown;
  offline_required?: unknown;
};

export type MonitorPayload = {
  connected: boolean;
  port: string;
  alarm: AlarmState;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossing_alert: CrossingAlert | null;
  config: MonitorConfig;
  units?: UnitPlacement[];
  sensor_status?: Record<string, BackendSensorStatus>;
  map_policy?: BackendMapPolicy;
};

export type MonitorState = {
  connected: boolean;
  port: string;
  alarm: AlarmState;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossingAlerts: CrossingAlert[];
  crossingAckWindows: CrossingAckWindow[];
  config: MonitorConfig;
  globalSettings: GlobalSettings;
  units: UnitPlacement[];
  pairings: PairLink[];
  sensorStatus: SensorStatusMap;
  mapPolicy: MapPolicy;
};
