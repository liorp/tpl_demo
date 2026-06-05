import type {
  AlarmState,
  CrossingAckWindow,
  CrossingAlert,
  MonitorEvent,
  MonitorPayload,
  MonitorState,
  PairLink,
  SensorStatusMap,
  ServerState,
  SignalLinkState,
  UnitPlacement,
} from './types';
import {
  parseCrossingAlert,
  parseMapPolicy,
  parsePayloadUnits,
  parsePingLatencies,
  parseSensorStatusMap,
  parseSignalLinks,
} from './validation';

const MAX_EVENTS = 50;
const MAX_UNITS = 32;
const MAX_CROSSING_ALERTS = 8;
const MAX_CROSSING_ACK_WINDOWS = 40;
const CROSSING_ALERT_DEDUP_WINDOW_MS = 10_000;
const CROSSING_ACK_SUPPRESSION_WINDOW_MS = 2_000;
const MAP_FROM_RE = /MAP from (\d+)/;
const CLOCK_TIME_RE = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

export function toCrossingAlert(
  raw: MonitorPayload['crossing_alert'],
): CrossingAlert | null {
  return parseCrossingAlert(raw);
}

export function toPayloadUnits(
  payloadUnits: MonitorPayload['units'],
  sensorStatus: SensorStatusMap,
): UnitPlacement[] {
  const parsedUnits = parsePayloadUnits(payloadUnits);
  const nextUnits: UnitPlacement[] = [];
  const seenIds = new Set<number>();
  for (const unit of parsedUnits) {
    const { id, lat, lng, label } = unit;
    seenIds.add(id);
    const sensor = sensorStatus[String(id)];
    nextUnits.push({
      id,
      label,
      lat,
      lng,
      ...(sensor
        ? {
            status:
              sensor.connectedPeers.length > 0
                ? ('active' as const)
                : ('inactive' as const),
            lastSeenAt: sensor.lastSeen ?? undefined,
          }
        : {}),
    });
  }

  for (const [sensorIdStr, sensor] of Object.entries(sensorStatus)) {
    const sensorId = Number.parseInt(sensorIdStr, 10);
    if (!Number.isInteger(sensorId) || sensorId <= 0 || seenIds.has(sensorId)) {
      continue;
    }
    const fallback = toDefaultUnitPosition(sensorId);
    nextUnits.push({
      id: sensorId,
      label: `S${sensorId}`,
      lat: fallback.lat,
      lng: fallback.lng,
      status:
        sensor.connectedPeers.length > 0
          ? ('active' as const)
          : ('inactive' as const),
      lastSeenAt: sensor.lastSeen ?? undefined,
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
    config: {
      noise_threshold: null,
      gain: null,
      detection_mode: null,
    },
    sensorStatus: {},
    pingLatencies: {},
    mapPolicy: parseMapPolicy(undefined),
  };
}

export function createInitialMonitorState(): MonitorState {
  return {
    ...createInitialServerState(),
    crossingAlerts: [],
    globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    units: [],
    pairings: [],
    annotations: [],
  };
}

function deriveAlarmState(
  connected: boolean,
  crossingAlert: CrossingAlert | null,
): AlarmState {
  if (!connected) {
    return 'disconnected';
  }
  if (crossingAlert) {
    return 'alarm';
  }
  return 'clear';
}

export function toServerStateFromPayload(payload: MonitorPayload): ServerState {
  const sensorStatus = parseSensorStatusMap(payload.sensor_status);
  const pingLatencies = parsePingLatencies(payload.ping_latencies);
  const crossingAlert = toCrossingAlert(payload.crossing_alert);
  const noiseThreshold =
    typeof payload.config.noise_threshold === 'number' &&
    Number.isFinite(payload.config.noise_threshold)
      ? payload.config.noise_threshold
      : null;
  const detectionMode =
    payload.config.detection_mode === 1 || payload.config.detection_mode === 2
      ? payload.config.detection_mode
      : null;
  return {
    serverOnline: true,
    connected: payload.connected,
    port: payload.port,
    alarm: deriveAlarmState(payload.connected, crossingAlert),
    events: sortEventsByTimestampDesc(payload.events).slice(0, MAX_EVENTS),
    links: parseSignalLinks(payload.links, Math.floor(Date.now() / 1000)),
    config: {
      gain:
        typeof payload.config.gain === 'number' &&
        Number.isFinite(payload.config.gain)
          ? payload.config.gain
          : null,
      noise_threshold: noiseThreshold,
      detection_mode: detectionMode,
    },
    sensorStatus,
    pingLatencies,
    mapPolicy: parseMapPolicy(payload.map_policy),
  };
}

function parseEventTimestampMs(time: string): number {
  const normalized = time.trim();
  if (normalized.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return normalized.length <= 10 ? numeric * 1000 : numeric;
  }

  const parsedDate = Date.parse(normalized);
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  const clockMatch = CLOCK_TIME_RE.exec(normalized);
  if (!clockMatch) {
    return Number.NEGATIVE_INFINITY;
  }

  const hours = Number(clockMatch[1]);
  const minutes = Number(clockMatch[2]);
  const seconds = Number(clockMatch[3]);
  const millis = Number((clockMatch[4] ?? '0').padEnd(3, '0'));
  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function sortEventsByTimestampDesc(events: MonitorEvent[]): MonitorEvent[] {
  return events
    .map((event, index) => ({
      event,
      index,
      timestampMs: parseEventTimestampMs(event.time),
    }))
    .sort((a, b) => {
      if (a.timestampMs !== b.timestampMs) {
        return b.timestampMs - a.timestampMs;
      }
      // Timestamps are second-resolution, so same-second events can't be
      // distinguished by `time`. The server already emits newest-first
      // (add_log inserts at index 0), so preserve that arrival order on ties
      // — a fresh event keeps flowing to the top instead of sinking below
      // its same-second neighbours.
      return a.index - b.index;
    })
    .map((entry) => entry.event);
}

export function toMonitorStateFromPayload(
  payload: MonitorPayload,
): MonitorState {
  const crossingAlert = toCrossingAlert(payload.crossing_alert);
  const serverState = toServerStateFromPayload(payload);
  return {
    ...serverState,
    crossingAlerts: crossingAlert ? [crossingAlert] : [],
    globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    units: toPayloadUnits(payload.units, serverState.sensorStatus),
    pairings: [],
    annotations: [],
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
    const existing = previous[existingIndex];
    const refreshed =
      existing === undefined
        ? normalized
        : {
            ...normalized,
            at: existing.at,
          };
    const withoutDuplicate = previous.filter(
      (_, index) => index !== existingIndex,
    );
    return [refreshed, ...withoutDuplicate].slice(0, maxAlerts);
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

export function isPairEnabled(
  pairings: PairLink[],
  sensorA: number,
  sensorB: number,
): boolean {
  const side1 = Math.min(sensorA, sensorB);
  const side2 = Math.max(sensorA, sensorB);
  return pairings.some(
    (pair) => pair.enabled && pair.side1Id === side1 && pair.side2Id === side2,
  );
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
  // Only real detection alarms ("DETECTION 11-12 th=.. val=..") are alarms.
  // Must NOT match "DETECTION_MODE mode=2", which is a normal config event.
  return /^DETECTION\s/.test(msg);
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
