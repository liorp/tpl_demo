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

export type MonitorConfig = {
  threshold: number | null;
  val: number | null;
};

export type MonitorPayload = {
  connected: boolean;
  port: string;
  alarm: AlarmState;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossing_alert: CrossingAlert | null;
  config: MonitorConfig;
};

export type MonitorState = {
  connected: boolean;
  port: string;
  alarm: AlarmState;
  events: MonitorEvent[];
  links: SignalLinkState[];
  crossingAlert: CrossingAlert | null;
  config: MonitorConfig;
  units: UnitPlacement[];
  pairings: PairLink[];
};
