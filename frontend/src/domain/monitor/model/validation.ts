import { z } from 'zod';

import type {
  AntennaMode,
  CrossingAlert,
  MapPolicy,
  MonitorPayload,
  PingLatencyMap,
  SensorStatusMap,
  SignalLinkState,
  UnitPlacement,
} from './types';
import { ALARM_STATES } from './types';

const finiteNumberSchema = z.number().refine(Number.isFinite);
const alarmStateSchema = z.enum(ALARM_STATES);
const monitorEventSchema = z
  .object({
    time: z.string(),
    msg: z.string(),
  })
  .passthrough();

const crossingAlertInputSchema = z
  .object({
    sensor_a: finiteNumberSchema.optional(),
    sensor_b: finiteNumberSchema.optional(),
    timestamp: finiteNumberSchema.optional(),
    value: finiteNumberSchema.optional(),
    threshold: finiteNumberSchema.optional(),
    lat: finiteNumberSchema.nullable().optional(),
    lng: finiteNumberSchema.nullable().optional(),
    acknowledged: z.boolean().optional(),
  })
  .passthrough();

const mapBoundsSchema = z.object({
  north: finiteNumberSchema,
  south: finiteNumberSchema,
  west: finiteNumberSchema,
  east: finiteNumberSchema,
});

const mapPolicyInputSchema = z
  .object({
    bounds: z.unknown().optional(),
    buffer_km: finiteNumberSchema.optional(),
    tile_root: z.string().optional(),
    offline_required: z.boolean().optional(),
  })
  .passthrough();

const sensorStatusEntrySchema = z
  .object({
    last_seen: z.unknown().optional(),
    connected_peers: z.unknown().optional(),
    active_antenna: z.unknown().optional(),
    supported_antennas: z.unknown().optional(),
    voltage: z.unknown().optional(),
    version: z.unknown().optional(),
  })
  .passthrough();

const pingLatencyEntrySchema = z
  .object({
    round_trip_ms: z.unknown().optional(),
    received_at: z.unknown().optional(),
  })
  .passthrough();

const unitPayloadSchema = z
  .object({
    id: finiteNumberSchema.int(),
    lat: finiteNumberSchema,
    lng: finiteNumberSchema,
    label: z.string().optional(),
  })
  .passthrough();

const signalLinkPayloadSchema = z
  .object({
    side1: finiteNumberSchema.int(),
    side2: finiteNumberSchema.int(),
    threshold: finiteNumberSchema.int().optional(),
    gain: finiteNumberSchema.int().optional(),
    rssi: finiteNumberSchema.int().optional(),
    dt: finiteNumberSchema.int().optional(),
    updatedAt: finiteNumberSchema.int().optional(),
    updated_at: finiteNumberSchema.int().optional(),
    updatedat: finiteNumberSchema.int().optional(),
  })
  .passthrough();

const monitorPayloadEnvelopeSchema = z.object({
  connected: z.boolean(),
  port: z.string(),
  alarm: alarmStateSchema,
  events: z.array(monitorEventSchema),
  links: z.array(z.unknown()),
  crossing_alert: z.unknown().nullable().optional(),
  config: z.object({ gain: z.unknown() }),
  units: z.array(z.unknown()).optional(),
  sensor_status: z.record(z.string(), z.unknown()).optional(),
  ping_latencies: z.record(z.string(), z.unknown()).optional(),
  map_policy: z.unknown().optional(),
});

export function isMonitorPayload(value: unknown): value is MonitorPayload {
  return monitorPayloadEnvelopeSchema.safeParse(value).success;
}

export function parseCrossingAlert(raw: unknown): CrossingAlert | null {
  const parsed = crossingAlertInputSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const alert = parsed.data;
  const sensorA = alert.sensor_a ?? null;
  const sensorB = alert.sensor_b ?? null;
  const at = alert.timestamp ?? null;

  if (sensorA === null || sensorB === null || at === null) {
    return null;
  }

  const side1 = Math.min(sensorA, sensorB);
  const side2 = Math.max(sensorA, sensorB);

  return {
    sensorA: side1,
    sensorB: side2,
    at,
    ...(alert.value !== undefined ? { value: alert.value } : {}),
    ...(alert.threshold !== undefined ? { threshold: alert.threshold } : {}),
    lat: alert.lat ?? null,
    lng: alert.lng ?? null,
    acknowledged: alert.acknowledged === true,
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

export function parseMapPolicy(raw: unknown): MapPolicy {
  const parsed = mapPolicyInputSchema.safeParse(raw);
  if (!parsed.success) {
    return toDefaultMapPolicy();
  }

  const bounds = mapBoundsSchema.safeParse(parsed.data.bounds);
  return {
    bounds: bounds.success ? bounds.data : null,
    bufferKm: parsed.data.buffer_km ?? null,
    tileRoot: parsed.data.tile_root ?? null,
    offlineRequired: parsed.data.offline_required === true,
  };
}

function asAntennaMode(raw: unknown): AntennaMode | null {
  if (raw === 1 || raw === 2) return raw;
  return null;
}

export function parseSensorStatusMap(raw: unknown): SensorStatusMap {
  const record = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!record.success) {
    return {};
  }

  const next: SensorStatusMap = {};
  for (const [sensorId, status] of Object.entries(record.data)) {
    const parsed = sensorStatusEntrySchema.safeParse(status);
    if (!parsed.success) {
      continue;
    }
    const peers = z.array(z.unknown()).safeParse(parsed.data.connected_peers);
    const connectedPeers = peers.success
      ? peers.data.flatMap((peer) => {
          const parsedPeer = finiteNumberSchema.safeParse(peer);
          return parsedPeer.success ? [parsedPeer.data] : [];
        })
      : [];
    const lastSeen = finiteNumberSchema.safeParse(parsed.data.last_seen);
    const supported = finiteNumberSchema
      .int()
      .safeParse(parsed.data.supported_antennas);
    const voltage = finiteNumberSchema.safeParse(parsed.data.voltage);
    const version = z.string().safeParse(parsed.data.version);
    next[sensorId] = {
      lastSeen: lastSeen.success ? lastSeen.data : null,
      connectedPeers,
      activeAntenna: asAntennaMode(parsed.data.active_antenna),
      supportedAntennas: supported.success ? supported.data : null,
      voltage: voltage.success ? voltage.data : null,
      version: version.success ? version.data : null,
    };
  }

  return next;
}

export function parsePingLatencies(raw: unknown): PingLatencyMap {
  const record = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!record.success) {
    return {};
  }
  const next: PingLatencyMap = {};
  for (const [unitId, entry] of Object.entries(record.data)) {
    const parsed = pingLatencyEntrySchema.safeParse(entry);
    if (!parsed.success) continue;
    const rtt = finiteNumberSchema.safeParse(parsed.data.round_trip_ms);
    const received = finiteNumberSchema.safeParse(parsed.data.received_at);
    if (!rtt.success) continue;
    const numericId = Number.parseInt(unitId, 10);
    if (!Number.isInteger(numericId)) continue;
    next[unitId] = {
      unit: numericId,
      roundTripMs: rtt.data,
      receivedAt: received.success ? received.data : 0,
    };
  }
  return next;
}

export function parsePayloadUnits(payloadUnits: unknown): UnitPlacement[] {
  const parsed = z.array(z.unknown()).safeParse(payloadUnits);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.flatMap((entry) => {
    const unit = unitPayloadSchema.safeParse(entry);
    if (!unit.success) {
      return [];
    }
    return [
      {
        id: unit.data.id,
        label:
          typeof unit.data.label === 'string'
            ? unit.data.label
            : `S${unit.data.id}`,
        lat: unit.data.lat,
        lng: unit.data.lng,
      },
    ];
  });
}

export function parseSignalLinks(
  payloadLinks: MonitorPayload['links'],
  observedAt: number,
): SignalLinkState[] {
  const parsed = z.array(z.unknown()).safeParse(payloadLinks);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.flatMap((entry) => {
    const link = signalLinkPayloadSchema.safeParse(entry);
    if (!link.success) {
      return [];
    }
    const updatedAt =
      link.data.updated_at ??
      link.data.updatedAt ??
      link.data.updatedat ??
      observedAt;
    return [
      {
        side1: link.data.side1,
        side2: link.data.side2,
        threshold: link.data.threshold ?? 0,
        gain: link.data.gain ?? 0,
        rssi: link.data.rssi ?? 0,
        dt: link.data.dt ?? 0,
        updatedAt,
      },
    ];
  });
}

const nonEmptyStringToNumberSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^-?\d+(\.\d+)?$/)
  .transform((value) => Number(value))
  .pipe(finiteNumberSchema);

export function parseInputNumber(value: string): number | null {
  const parsed = nonEmptyStringToNumberSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
