import type {
  BackendMapPolicy,
  BackendSensorStatus,
  CrossingAckWindow,
  CrossingAlert,
  MapBounds,
  MapPolicy,
  MonitorPayload,
  MonitorState,
  PairLink,
  SensorStatusMap,
  ServerState,
  SignalLinkState,
  UnitPlacement,
} from './types';

const MAX_EVENTS = 50;
const MAX_UNITS = 32;
const MAX_CROSSING_ALERTS = 8;
const MAX_CROSSING_ACK_WINDOWS = 40;
const CROSSING_ALERT_DEDUP_WINDOW_MS = 10_000;
const CROSSING_ACK_SUPPRESSION_WINDOW_MS = 2_000;
const MAP_FROM_RE = /MAP from (\d+)/;

export function toCrossingAlert(
  raw: MonitorPayload['crossing_alert'],
): CrossingAlert | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const sensorA =
    typeof value.sensorA === 'number'
      ? value.sensorA
      : typeof value.sensor_a === 'number'
        ? value.sensor_a
        : null;
  const sensorB =
    typeof value.sensorB === 'number'
      ? value.sensorB
      : typeof value.sensor_b === 'number'
        ? value.sensor_b
        : null;
  const at =
    typeof value.at === 'number'
      ? value.at
      : typeof value.timestamp === 'number'
        ? value.timestamp
        : null;

  if (sensorA === null || sensorB === null || at === null) {
    return null;
  }
  const side1 = Math.min(sensorA, sensorB);
  const side2 = Math.max(sensorA, sensorB);

  return {
    sensorA: side1,
    sensorB: side2,
    at,
    lat: typeof value.lat === 'number' ? value.lat : null,
    lng: typeof value.lng === 'number' ? value.lng : null,
    acknowledged: value.acknowledged === true,
  };
}

function toDefaultMapPolicy(): MapPolicy {
  return {
    bounds: null,
    bufferKm: null,
    tileRoot: '/tiles',
    offlineRequired: true,
  };
}

function toMapBounds(raw: unknown): MapBounds | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const north = value.north;
  const south = value.south;
  const west = value.west;
  const east = value.east;
  if (
    typeof north !== 'number' ||
    typeof south !== 'number' ||
    typeof west !== 'number' ||
    typeof east !== 'number'
  ) {
    return null;
  }
  return { north, south, west, east };
}

function toMapPolicy(raw: BackendMapPolicy | undefined): MapPolicy {
  if (!raw || typeof raw !== 'object') {
    return toDefaultMapPolicy();
  }
  return {
    bounds: toMapBounds(raw.bounds),
    bufferKm: typeof raw.buffer_km === 'number' ? raw.buffer_km : null,
    tileRoot: typeof raw.tile_root === 'string' ? raw.tile_root : null,
    offlineRequired: raw.offline_required === true,
  };
}

function toSensorStatusMap(
  raw: MonitorPayload['sensor_status'],
): SensorStatusMap {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const next: SensorStatusMap = {};
  for (const [sensorId, status] of Object.entries(raw)) {
    if (!status || typeof status !== 'object') {
      continue;
    }
    const value = status as BackendSensorStatus;
    const connectedPeers = Array.isArray(value.connected_peers)
      ? value.connected_peers.filter(
          (peer): peer is number => typeof peer === 'number',
        )
      : [];
    next[sensorId] = {
      active: value.active === true,
      lastSeen: typeof value.last_seen === 'number' ? value.last_seen : null,
      connectedPeers,
    };
  }
  return next;
}

export function toPayloadUnits(
  payloadUnits: MonitorPayload['units'],
  sensorStatus: SensorStatusMap,
): UnitPlacement[] {
  if (!Array.isArray(payloadUnits)) {
    return [];
  }

  const nextUnits: UnitPlacement[] = [];
  for (const unit of payloadUnits) {
    if (!unit || typeof unit !== 'object') {
      continue;
    }
    const value = unit as Record<string, unknown>;
    const id = value.id;
    const lat = value.lat;
    const lng = value.lng;
    if (
      typeof id !== 'number' ||
      !Number.isInteger(id) ||
      typeof lat !== 'number' ||
      typeof lng !== 'number'
    ) {
      continue;
    }
    const sensor = sensorStatus[String(id)];
    nextUnits.push({
      id,
      label: typeof value.label === 'string' ? value.label : `S${id}`,
      lat,
      lng,
      ...(sensor
        ? {
            status: sensor.active ? ('active' as const) : ('inactive' as const),
            lastSeenAt: sensor.lastSeen ?? undefined,
          }
        : {}),
    });
  }

  return nextUnits.slice(0, MAX_UNITS);
}

export function createInitialServerState(): ServerState {
  return {
    serverOnline: false,
    connected: false,
    port: 'None',
    alarm: 'disconnected',
    events: [],
    links: [],
    config: { threshold: null, val: null },
    sensorStatus: {},
    mapPolicy: toDefaultMapPolicy(),
  };
}

export function createInitialMonitorState(): MonitorState {
  return {
    ...createInitialServerState(),
    crossingAlerts: [],
    crossingAckWindows: [],
    globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    units: [],
    pairings: [],
  };
}

export function toServerStateFromPayload(payload: MonitorPayload): ServerState {
  const sensorStatus = toSensorStatusMap(payload.sensor_status);
  return {
    serverOnline: true,
    connected: payload.connected,
    port: payload.port,
    alarm: payload.alarm,
    events: payload.events.slice(0, MAX_EVENTS),
    links: payload.links,
    config: payload.config,
    sensorStatus,
    mapPolicy: toMapPolicy(payload.map_policy),
  };
}

export function toMonitorStateFromPayload(
  payload: MonitorPayload,
): MonitorState {
  const crossingAlert = toCrossingAlert(payload.crossing_alert);
  const serverState = toServerStateFromPayload(payload);
  return {
    ...serverState,
    crossingAlerts: crossingAlert ? [crossingAlert] : [],
    crossingAckWindows: [],
    globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    units: toPayloadUnits(payload.units, serverState.sensorStatus),
    pairings: [],
  };
}

export function mergeCrossingAlerts(
  previous: CrossingAlert[],
  next: CrossingAlert | null,
  dedupWindowMs = CROSSING_ALERT_DEDUP_WINDOW_MS,
  maxAlerts = MAX_CROSSING_ALERTS,
): CrossingAlert[] {
  if (!next) {
    return previous;
  }

  const sensorA = Math.min(next.sensorA, next.sensorB);
  const sensorB = Math.max(next.sensorA, next.sensorB);
  const normalized = { ...next, sensorA, sensorB };

  const existingIndex = previous.findIndex(
    (alert) =>
      alert.sensorA === sensorA &&
      alert.sensorB === sensorB &&
      Math.abs(normalized.at - alert.at) <= dedupWindowMs,
  );

  if (existingIndex >= 0) {
    const withoutDuplicate = previous.filter(
      (_, index) => index !== existingIndex,
    );
    return [normalized, ...withoutDuplicate].slice(0, maxAlerts);
  }

  return [normalized, ...previous].slice(0, maxAlerts);
}

export function acknowledgeCrossingAlert(
  alerts: CrossingAlert[],
  target: CrossingAlert,
): CrossingAlert[] {
  return alerts.filter(
    (alert) =>
      !(
        alert.sensorA === target.sensorA &&
        alert.sensorB === target.sensorB &&
        alert.at === target.at
      ),
  );
}

export function addCrossingAckWindow(
  windows: CrossingAckWindow[],
  alert: CrossingAlert,
  maxWindows = MAX_CROSSING_ACK_WINDOWS,
): CrossingAckWindow[] {
  const sensorA = Math.min(alert.sensorA, alert.sensorB);
  const sensorB = Math.max(alert.sensorA, alert.sensorB);
  const nextWindow: CrossingAckWindow = { sensorA, sensorB, at: alert.at };
  return [nextWindow, ...windows].slice(0, maxWindows);
}

export function isCrossingAlertSuppressed(
  alert: CrossingAlert | null,
  windows: CrossingAckWindow[],
  suppressionWindowMs = CROSSING_ACK_SUPPRESSION_WINDOW_MS,
): boolean {
  if (!alert) {
    return false;
  }
  const sensorA = Math.min(alert.sensorA, alert.sensorB);
  const sensorB = Math.max(alert.sensorA, alert.sensorB);

  return windows.some(
    (window) =>
      window.sensorA === sensorA &&
      window.sensorB === sensorB &&
      Math.abs(alert.at - window.at) <= suppressionWindowMs,
  );
}

function toDefaultUnitPosition(unitId: number): { lat: number; lng: number } {
  const lat = 33.31 + ((unitId % 7) - 3) * 0.01;
  const lng = 35.78 + ((Math.floor(unitId / 7) % 7) - 3) * 0.01;
  return { lat, lng };
}

function discoverUnitIds(payload: MonitorPayload): number[] {
  const discovered = new Set<number>();

  for (const link of payload.links) {
    discovered.add(link.side1);
    discovered.add(link.side2);
  }

  for (const event of payload.events) {
    const mapMatch = MAP_FROM_RE.exec(event.msg);
    if (mapMatch) {
      discovered.add(Number.parseInt(mapMatch[1], 10));
    }

    for (const match of event.msg.matchAll(/\((\d+)\)/g)) {
      discovered.add(Number.parseInt(match[1], 10));
    }
  }

  return [...discovered]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function mergeTelemetryUnits(
  previousUnits: UnitPlacement[],
  payload: MonitorPayload,
  observedAt = nowSeconds(),
): UnitPlacement[] {
  const discoveredIds = new Set(discoverUnitIds(payload));
  const previousById = new Map(
    previousUnits.map((unit) => [unit.id, unit] as const),
  );
  const nextUnits: UnitPlacement[] = [];

  for (const unitId of discoveredIds) {
    const existingUnit = previousById.get(unitId);
    if (existingUnit) {
      nextUnits.push({
        ...existingUnit,
        status: 'active',
        lastSeenAt: observedAt,
      });
      continue;
    }
    const fallback = toDefaultUnitPosition(unitId);
    nextUnits.push({
      id: unitId,
      label: `S${unitId}`,
      lat: fallback.lat,
      lng: fallback.lng,
      status: 'active',
      lastSeenAt: observedAt,
    });
  }

  for (const previous of previousUnits) {
    if (discoveredIds.has(previous.id)) {
      continue;
    }
    nextUnits.push({ ...previous, status: 'inactive' });
  }

  return nextUnits.sort((a, b) => a.id - b.id).slice(0, MAX_UNITS);
}

export function shouldShowAck(state: MonitorState): boolean {
  return state.alarm === 'alarm';
}

export function isDetectionEvent(msg: string): boolean {
  return msg.includes('DETECTION');
}

export function upsertUnitInList(
  units: UnitPlacement[],
  unit: UnitPlacement,
): UnitPlacement[] {
  const existingIndex = units.findIndex((entry) => entry.id === unit.id);
  if (existingIndex >= 0) {
    const next = [...units];
    next[existingIndex] = { ...next[existingIndex], ...unit };
    return next;
  }
  if (units.length >= MAX_UNITS) {
    return units;
  }
  return [...units, unit];
}

export function setPairingInList(
  units: UnitPlacement[],
  pairings: PairLink[],
  side1Id: number,
  side2Id: number,
  enabled: boolean,
): PairLink[] {
  if (side1Id === side2Id) {
    return pairings;
  }
  const hasSide1 = units.some((unit) => unit.id === side1Id);
  const hasSide2 = units.some((unit) => unit.id === side2Id);
  if (!hasSide1 || !hasSide2) {
    return pairings;
  }

  const canonicalSide1 = Math.min(side1Id, side2Id);
  const canonicalSide2 = Math.max(side1Id, side2Id);
  const next = pairings.filter(
    (pair) =>
      !(
        (pair.side1Id === canonicalSide1 && pair.side2Id === canonicalSide2) ||
        (pair.side1Id === canonicalSide2 && pair.side2Id === canonicalSide1)
      ),
  );
  if (!enabled) {
    return next;
  }

  const pairing: PairLink = {
    side1Id: canonicalSide1,
    side2Id: canonicalSide2,
    enabled: true,
  };
  return [...next, pairing];
}

export function upsertUnit(
  state: MonitorState,
  unit: UnitPlacement,
): MonitorState {
  const units = upsertUnitInList(state.units, unit);
  return units === state.units ? state : { ...state, units };
}

export function setPairing(
  state: MonitorState,
  side1Id: number,
  side2Id: number,
  enabled: boolean,
): MonitorState {
  const pairings = setPairingInList(
    state.units,
    state.pairings,
    side1Id,
    side2Id,
    enabled,
  );
  return pairings === state.pairings ? state : { ...state, pairings };
}

export function isSignalFresh(
  link: Pick<SignalLinkState, 'updatedAt'>,
  now: number,
  staleMs = 10_000,
): boolean {
  return now - link.updatedAt < staleMs;
}
