import { z } from 'zod';

import type {
  CrossingAlert,
  MapPolicy,
  MonitorPayload,
  SensorStatusMap,
  SignalLinkState,
  UnitPlacement,
} from './types';

const finiteNumberSchema = z.number().refine(Number.isFinite);

const crossingAlertInputSchema = z
  .object({
    sensor_a: finiteNumberSchema.optional(),
    sensor_b: finiteNumberSchema.optional(),
    timestamp: finiteNumberSchema.optional(),
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
  alarm: z.string(),
  events: z.array(z.unknown()),
  links: z.array(z.unknown()),
  crossing_alert: z.unknown().nullable().optional(),
  config: z.object({ gain: z.unknown() }),
  units: z.array(z.unknown()).optional(),
  sensor_status: z.record(z.string(), z.unknown()).optional(),
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

  const value = parsed.data;
  const sensorA = value.sensor_a ?? null;
  const sensorB = value.sensor_b ?? null;
  const at = value.timestamp ?? null;

  if (sensorA === null || sensorB === null || at === null) {
    return null;
  }

  const side1 = Math.min(sensorA, sensorB);
  const side2 = Math.max(sensorA, sensorB);

  return {
    sensorA: side1,
    sensorB: side2,
    at,
    lat: value.lat ?? null,
    lng: value.lng ?? null,
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
    next[sensorId] = {
      lastSeen: lastSeen.success ? lastSeen.data : null,
      connectedPeers,
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
