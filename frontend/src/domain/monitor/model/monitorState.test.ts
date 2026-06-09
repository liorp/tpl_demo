import { describe, expect, test } from 'vitest';
import {
  acknowledgeCrossingAlert,
  createInitialMonitorState,
  crossingPairKey,
  isDetectionEvent,
  isPairEnabled,
  isSignalFresh,
  mergeCrossingAlerts,
  mergeTelemetryUnits,
  pruneAcknowledgedPairs,
  setPairing,
  shouldShowAck,
  toMonitorStateFromPayload,
  toServerStateFromPayload,
  upsertUnit,
} from './monitorState';
import type { MonitorPayload } from './types';

describe('monitor state model', () => {
  test('creates disconnected initial state', () => {
    const state = createInitialMonitorState();

    expect(state.alarm).toBe('disconnected');
    expect(state.connected).toBe(false);
    expect(state.events).toHaveLength(0);
  });

  test('maps websocket payload into monitor state', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [{ time: '20:00:00', msg: 'DETECTION x' }],
      links: [],
      crossing_alert: {
        sensor_a: 11,
        sensor_b: 12,
        timestamp: 1_739_742_000,
        value: 860,
        threshold: 500,
        lat: null,
        lng: null,
        acknowledged: false,
      },
      config: { gain: null },
    });

    expect(state.connected).toBe(true);
    expect(state.port).toBe('/dev/ttyUSB0');
    expect(state.alarm).toBe('alarm');
    expect(shouldShowAck(state)).toBe(true);
  });

  test('derives alarm state from frontend payload data', () => {
    const clear = toServerStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
    });
    expect(clear.alarm).toBe('clear');

    const alarm = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: {
        sensor_a: 11,
        sensor_b: 12,
        timestamp: 1_739_742_000,
        value: 860,
        threshold: 500,
        lat: null,
        lng: null,
        acknowledged: false,
      },
      config: { gain: null },
    });
    expect(alarm.alarm).toBe('alarm');

    const disconnected = toServerStateFromPayload({
      connected: false,
      port: 'None',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
    });
    expect(disconnected.alarm).toBe('disconnected');
  });

  test('normalizes link updatedAt from backend payload and provides fallback when missing', () => {
    const state = toServerStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [
        {
          side1: 11,
          side2: 12,
          threshold: 500,
          rssi: -57,
          dt: 180,
          updated_at: 1234,
        } as unknown as never,
        {
          side1: 12,
          side2: 13,
          threshold: 450,
          rssi: -60,
          dt: 200,
        } as unknown as never,
      ],
      crossing_alert: null,
      config: { gain: null },
    } as MonitorPayload);

    expect(state.links[0]).toMatchObject({
      side1: 11,
      side2: 12,
      threshold: 500,
      rssi: -57,
      dt: 180,
      updatedAt: 1234,
    });
    expect(typeof state.links[1]?.updatedAt).toBe('number');
    expect(Number.isFinite(state.links[1]?.updatedAt)).toBe(true);
  });

  test('classifies only real detection alarms as detection events', () => {
    expect(isDetectionEvent('DETECTION 11-12 th=300 val=512')).toBe(true);
    // Config events must not be flagged as alarms (no red styling).
    expect(isDetectionEvent('DETECTION_MODE mode=2')).toBe(false);
    expect(isDetectionEvent('ANTENNA u=11 active=1 supported=3')).toBe(false);
    expect(isDetectionEvent('MAP_DEV 11 ver=SG v=2926')).toBe(false);
  });

  test('sorts events by timestamp descending so newest entries render on top', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      // Server emits newest-first (add_log inserts at index 0).
      events: [
        { time: '21:55:46', msg: 'DETECTION same-second newer' },
        { time: '21:55:46', msg: 'DETECTION same-second older' },
        { time: '21:55:45', msg: 'SYSTEM mid' },
        { time: '21:55:44', msg: 'SYSTEM old' },
      ],
      links: [],
      crossing_alert: null,
      config: { gain: null },
    });

    expect(state.events.map((event) => event.msg)).toEqual([
      'DETECTION same-second newer',
      'DETECTION same-second older',
      'SYSTEM mid',
      'SYSTEM old',
    ]);
  });

  test('maps backend units, sensor_status, and map_policy payload fields', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [
        { id: 7, label: 'S7', lat: 33.31, lng: 35.78 },
        { id: 8, label: 'S8', lat: 33.32, lng: 35.79 },
      ],
      sensor_status: {
        '7': { last_seen: 101, connected_peers: [8] },
        '8': { last_seen: 99, connected_peers: [] },
      },
      map_policy: {
        bounds: { north: 34.0, south: 33.0, west: 35.0, east: 36.0 },
        buffer_km: 2,
        tile_root: '/tiles',
        offline_required: true,
      },
    } as MonitorPayload);

    expect(state.units).toEqual([
      {
        id: 7,
        label: 'S7',
        lat: 33.31,
        lng: 35.78,
        status: 'active',
        lastSeenAt: 101,
      },
      {
        id: 8,
        label: 'S8',
        lat: 33.32,
        lng: 35.79,
        status: 'inactive',
        lastSeenAt: 99,
      },
    ]);
    expect(state.sensorStatus).toEqual({
      '7': {
        lastSeen: 101,
        connectedPeers: [8],
        activeAntenna: null,
        supportedAntennas: null,
        voltage: null,
        version: null,
      },
      '8': {
        lastSeen: 99,
        connectedPeers: [],
        activeAntenna: null,
        supportedAntennas: null,
        voltage: null,
        version: null,
      },
    });
    expect(state.mapPolicy).toEqual({
      bounds: { north: 34.0, south: 33.0, west: 35.0, east: 36.0 },
      bufferKm: 2,
      tileRoot: '/tiles',
      offlineRequired: true,
    });
  });

  test('drops invalid numeric values in sensor_status and units payloads', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [
        { id: 7, label: 'S7', lat: Number.NaN, lng: 35.78 },
        { id: 8, label: 'S8', lat: 33.32, lng: 35.79 },
      ],
      sensor_status: {
        '8': {
          last_seen: Number.POSITIVE_INFINITY,
          connected_peers: [9, Number.NaN, Number.POSITIVE_INFINITY],
        },
      },
    } as MonitorPayload);

    expect(state.units).toEqual([
      {
        id: 8,
        label: 'S8',
        lat: 33.32,
        lng: 35.79,
        status: 'active',
      },
    ]);
    expect(state.sensorStatus).toEqual({
      '8': {
        lastSeen: null,
        connectedPeers: [9],
        activeAntenna: null,
        supportedAntennas: null,
        voltage: null,
        version: null,
      },
    });
  });

  test('maps snake_case crossing alert fields from backend payload', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: {
        // Backend payload shape.
        sensor_a: 11,
        sensor_b: 12,
        timestamp: 1_739_742_000,
        value: 860,
        threshold: 500,
        lat: null,
        lng: null,
        acknowledged: false,
      } as unknown as never,
      config: { gain: null },
    });

    expect(state.crossingAlerts).toEqual([
      {
        sensorA: 11,
        sensorB: 12,
        at: 1_739_742_000,
        value: 860,
        threshold: 500,
        lat: null,
        lng: null,
        acknowledged: false,
      },
    ]);
  });

  test('ignores camelCase crossing alert aliases to keep a single wire format', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: {
        sensorA: 11,
        sensorB: 12,
        at: 1_739_742_000,
      } as unknown as never,
      config: { gain: null },
    });

    expect(state.crossingAlerts).toEqual([]);
  });

  test('normalizes crossing pair order to ascending ids', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: {
        sensor_a: 12,
        sensor_b: 2,
        timestamp: 1_739_742_000,
        lat: null,
        lng: null,
        acknowledged: false,
      } as unknown as never,
      config: { gain: null },
    });

    expect(state.crossingAlerts).toEqual([
      {
        sensorA: 2,
        sensorB: 12,
        at: 1_739_742_000,
        lat: null,
        lng: null,
        acknowledged: false,
      },
    ]);
  });

  test('keeps legacy payload compatibility when new fields are omitted', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
    });

    expect(state.units).toEqual([]);
    expect(state.sensorStatus).toEqual({});
    expect(state.mapPolicy).toEqual({
      bounds: null,
      bufferKm: null,
      tileRoot: '/tiles',
      offlineRequired: true,
    });
  });

  test('upserts units and enforces max unit count', () => {
    let state = createInitialMonitorState();
    for (let id = 1; id <= 32; id += 1) {
      state = upsertUnit(state, {
        id,
        label: `U${id}`,
        lat: 32 + id / 1000,
        lng: 34,
      });
    }
    const overflow = upsertUnit(state, {
      id: 33,
      label: 'U33',
      lat: 32.5,
      lng: 34.5,
    });
    expect(overflow.units).toHaveLength(32);
    const moved = upsertUnit(state, { id: 1, label: 'U1', lat: 31, lng: 35 });
    expect(moved.units.find((u) => u.id === 1)?.lat).toBe(31);
  });

  test('creates and toggles undirected pairings', () => {
    let state = createInitialMonitorState();
    state = upsertUnit(state, { id: 1, label: 'U1', lat: 32, lng: 34 });
    state = upsertUnit(state, { id: 2, label: 'U2', lat: 32.2, lng: 34.2 });
    state = setPairing(state, 1, 2, true);
    expect(state.pairings).toEqual([{ side1Id: 1, side2Id: 2, enabled: true }]);

    state = setPairing(state, 2, 1, true);
    expect(state.pairings).toEqual([{ side1Id: 1, side2Id: 2, enabled: true }]);

    state = setPairing(state, 2, 1, false);
    expect(state.pairings).toEqual([]);
  });

  test('deduplicates crossing alerts while preserving first received timestamp', () => {
    const initial = [
      {
        sensorA: 2,
        sensorB: 12,
        at: 1_000,
        value: 530,
        threshold: 500,
        lat: null,
        lng: null,
        acknowledged: false,
      },
    ];
    const duplicate = {
      sensorA: 12,
      sensorB: 2,
      at: 4_000,
      value: 860,
      threshold: 500,
      lat: 33.1,
      lng: 35.7,
      acknowledged: false,
    };
    const outsideWindow = {
      sensorA: 2,
      sensorB: 12,
      at: 12_000,
      lat: null,
      lng: null,
      acknowledged: false,
    };

    const deduped = mergeCrossingAlerts(initial, duplicate, 5_000, 50);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.at).toBe(1_000);
    expect(deduped[0]?.value).toBe(860);
    expect(deduped[0]?.threshold).toBe(500);
    expect(deduped[0]?.lat).toBe(33.1);
    expect(deduped[0]?.lng).toBe(35.7);

    const appended = mergeCrossingAlerts(deduped, outsideWindow, 5_000, 50);
    expect(appended).toHaveLength(2);
    expect(appended[0]?.at).toBe(12_000);
    expect(appended[1]?.at).toBe(1_000);
  });

  test('removes a crossing alert when it is acknowledged', () => {
    const alerts = [
      {
        sensorA: 2,
        sensorB: 12,
        at: 1_000,
        lat: null,
        lng: null,
        acknowledged: false,
      },
      {
        sensorA: 3,
        sensorB: 8,
        at: 2_000,
        lat: null,
        lng: null,
        acknowledged: false,
      },
    ];

    const next = acknowledgeCrossingAlert(alerts, alerts[1]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ sensorA: 2, sensorB: 12 });
  });

  test('builds a canonical crossing pair key regardless of sensor order', () => {
    expect(crossingPairKey(12, 2)).toBe('2-12');
    expect(crossingPairKey(2, 12)).toBe('2-12');
  });

  test('keeps a dismissed pair acknowledged while it keeps crossing', () => {
    const acknowledged = new Set(['2-12']);
    // The device still reports this pair, so the dismissal must persist and the
    // banner stays hidden for the ongoing crossing.
    expect([...pruneAcknowledgedPairs(acknowledged, '2-12')]).toEqual(['2-12']);
  });

  test('clears a dismissed pair once its crossing ends so it can re-alarm', () => {
    const acknowledged = new Set(['2-12']);
    // Backend auto-reset -> no active crossing -> dismissal dropped.
    expect([...pruneAcknowledgedPairs(acknowledged, null)]).toEqual([]);
    // A different pair now crossing also means the old pair's crossing ended.
    expect([...pruneAcknowledgedPairs(acknowledged, '3-8')]).toEqual([]);
  });

  test('detects stale signal links', () => {
    expect(isSignalFresh({ updatedAt: 1_000 }, 11_000, 10_000)).toBe(false);
    expect(isSignalFresh({ updatedAt: 2_000 }, 11_000, 10_000)).toBe(true);
  });

  test('discovers units from telemetry logs and links', () => {
    const payload = {
      connected: true,
      port: '/dev/cu.usbserial-0001',
      events: [
        { time: '21:55:46', msg: 'MAP from 11 ver=0.4c10 gain=32 v=2130' },
        { time: '21:55:46', msg: 'MAP from 12 ver=0.4c10 gain=32 v=2587' },
        { time: '21:55:46', msg: 'MAP from 2 ver=0.4c10 gain=32 v=2112' },
      ],
      links: [
        {
          side1: 11,
          side2: 12,
          threshold: 500,
          gain: 64,
          rssi: -57,
          dt: 180,
          updatedAt: 1,
        },
      ],
      crossing_alert: null,
      config: { gain: null },
    };

    const nextUnits = mergeTelemetryUnits([], payload);
    const ids = nextUnits.map((unit) => unit.id).sort((a, b) => a - b);

    expect(ids).toEqual([2, 11, 12]);
  });

  test('assigns default sensor positions around Mount Hermon', () => {
    const payload = {
      connected: true,
      port: '/dev/cu.usbserial-0001',
      events: [
        { time: '21:55:46', msg: 'MAP from 1 ver=0.4c10 gain=32 v=2130' },
      ],
      links: [],
      crossing_alert: null,
      config: { gain: null },
    };

    const [unit] = mergeTelemetryUnits([], payload);

    expect(unit).toMatchObject({
      id: 1,
      lat: 33.29,
      lng: 35.75,
    });
  });

  test('marks local units as inactive when no longer reported by backend', () => {
    const previous = [
      { id: 2, label: 'S2', lat: 33.3, lng: 35.75, status: 'active' as const },
      {
        id: 11,
        label: 'S11',
        lat: 33.32,
        lng: 35.76,
        status: 'active' as const,
      },
      { id: 99, label: 'S99', lat: 33.2, lng: 35.8, status: 'active' as const },
    ];
    const payload = {
      connected: true,
      port: '/dev/cu.usbserial-0001',
      events: [
        { time: '21:55:46', msg: 'MAP from 2 ver=0.4c10 gain=32 v=2112' },
        { time: '21:55:46', msg: 'MAP from 11 ver=0.4c10 gain=32 v=2130' },
      ],
      links: [],
      crossing_alert: null,
      config: { gain: null },
    };

    const next = mergeTelemetryUnits(previous, payload);

    expect(
      next.map((unit) => ({
        id: unit.id,
        status: unit.status,
      })),
    ).toEqual([
      { id: 2, status: 'active' },
      { id: 11, status: 'active' },
      { id: 99, status: 'inactive' },
    ]);
  });

  test('assigns lastSeenAt for telemetry-discovered active sensors', () => {
    const payload = {
      connected: true,
      port: '/dev/cu.usbserial-0001',
      events: [
        { time: '21:55:46', msg: 'MAP from 2 ver=0.4c10 gain=32 v=2112' },
      ],
      links: [],
      crossing_alert: null,
      config: { gain: null },
    };

    const next = mergeTelemetryUnits([], payload, 1_700_000_120);

    expect(next).toEqual([
      expect.objectContaining({
        id: 2,
        status: 'active',
        lastSeenAt: 1_700_000_120,
      }),
    ]);
  });

  test('isPairEnabled returns true only for enabled pairings', () => {
    const pairings = [
      { side1Id: 2, side2Id: 12, enabled: true },
      { side1Id: 3, side2Id: 8, enabled: true },
    ];

    expect(isPairEnabled(pairings, 2, 12)).toBe(true);
    expect(isPairEnabled(pairings, 12, 2)).toBe(true);
    expect(isPairEnabled(pairings, 3, 8)).toBe(true);
    expect(isPairEnabled(pairings, 1, 12)).toBe(false);
    expect(isPairEnabled(pairings, 2, 3)).toBe(false);
  });

  test('isPairEnabled returns false when pairings list is empty', () => {
    expect(isPairEnabled([], 2, 12)).toBe(false);
  });
});
