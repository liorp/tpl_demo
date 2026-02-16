import type {
  CrossingAlert,
  MonitorPayload,
  MonitorState,
  PairLink,
  SignalLinkState,
  UnitPlacement,
} from './types';

const MAX_EVENTS = 50;
const MAX_UNITS = 32;
const MAX_CROSSING_ALERTS = 8;
const CROSSING_ALERT_DEDUP_WINDOW_MS = 10_000;
const MAP_FROM_RE = /MAP from (\d+)/;

function toCrossingAlert(
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

export function createInitialMonitorState(): MonitorState {
  return {
    connected: false,
    port: 'None',
    alarm: 'disconnected',
    events: [],
    links: [],
    crossingAlerts: [],
    config: { threshold: null, val: null },
    units: [],
    pairings: [],
  };
}

export function toMonitorStateFromPayload(
  payload: MonitorPayload,
): MonitorState {
  const crossingAlert = toCrossingAlert(payload.crossing_alert);
  return {
    connected: payload.connected,
    port: payload.port,
    alarm: payload.alarm,
    events: payload.events.slice(0, MAX_EVENTS),
    links: payload.links,
    crossingAlerts: crossingAlert ? [crossingAlert] : [],
    config: payload.config,
    units: [],
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

export function mergeTelemetryUnits(
  previousUnits: UnitPlacement[],
  payload: MonitorPayload,
): UnitPlacement[] {
  const discoveredIds = new Set(discoverUnitIds(payload));
  const previousById = new Map(
    previousUnits.map((unit) => [unit.id, unit] as const),
  );
  const nextUnits: UnitPlacement[] = [];

  for (const unitId of discoveredIds) {
    const existingUnit = previousById.get(unitId);
    if (existingUnit) {
      nextUnits.push({ ...existingUnit, status: 'active' });
      continue;
    }
    const fallback = toDefaultUnitPosition(unitId);
    nextUnits.push({
      id: unitId,
      label: `S${unitId}`,
      lat: fallback.lat,
      lng: fallback.lng,
      status: 'active',
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

export function upsertUnit(
  state: MonitorState,
  unit: UnitPlacement,
): MonitorState {
  const existingIndex = state.units.findIndex((entry) => entry.id === unit.id);
  if (existingIndex >= 0) {
    const units = [...state.units];
    units[existingIndex] = { ...units[existingIndex], ...unit };
    return { ...state, units };
  }
  if (state.units.length >= MAX_UNITS) {
    return state;
  }
  return { ...state, units: [...state.units, unit] };
}

export function setPairing(
  state: MonitorState,
  side1Id: number,
  side2Id: number,
  enabled: boolean,
): MonitorState {
  if (side1Id === side2Id) {
    return state;
  }
  const hasSide1 = state.units.some((unit) => unit.id === side1Id);
  const hasSide2 = state.units.some((unit) => unit.id === side2Id);
  if (!hasSide1 || !hasSide2) {
    return state;
  }

  const canonicalSide1 = Math.min(side1Id, side2Id);
  const canonicalSide2 = Math.max(side1Id, side2Id);
  const next = state.pairings.filter(
    (pair) =>
      !(
        (pair.side1Id === canonicalSide1 && pair.side2Id === canonicalSide2) ||
        (pair.side1Id === canonicalSide2 && pair.side2Id === canonicalSide1)
      ),
  );
  if (!enabled) {
    return { ...state, pairings: next };
  }

  const pairing: PairLink = {
    side1Id: canonicalSide1,
    side2Id: canonicalSide2,
    enabled: true,
  };
  return { ...state, pairings: [...next, pairing] };
}

export function isSignalFresh(
  link: Pick<SignalLinkState, 'updatedAt'>,
  now: number,
  staleMs = 10_000,
): boolean {
  return now - link.updatedAt < staleMs;
}
