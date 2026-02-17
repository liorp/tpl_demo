import { describe, expect, test } from 'vitest';
import {
  acknowledgeCrossingAlert,
  addCrossingAckWindow,
  createInitialMonitorState,
  isCrossingAlertSuppressed,
  isSignalFresh,
  mergeCrossingAlerts,
  mergeTelemetryUnits,
  setPairing,
  shouldShowAck,
  toMonitorStateFromPayload,
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
      alarm: 'alarm',
      events: [{ time: '20:00:00', msg: 'DETECTION x' }],
      links: [],
      crossing_alert: null,
      config: { threshold: null, val: null },
    });

    expect(state.connected).toBe(true);
    expect(state.port).toBe('/dev/ttyUSB0');
    expect(state.alarm).toBe('alarm');
    expect(shouldShowAck(state)).toBe(true);
  });

  test('maps backend units, sensor_status, and map_policy payload fields', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      alarm: 'clear',
      events: [],
      links: [],
      crossing_alert: null,
      config: { threshold: null, val: null },
      units: [
        { id: 7, label: 'S7', lat: 33.31, lng: 35.78 },
        { id: 8, label: 'S8', lat: 33.32, lng: 35.79 },
      ],
      sensor_status: {
        '7': { active: true, last_seen: 101, connected_peers: [8] },
        '8': { active: false, last_seen: 99, connected_peers: [7] },
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
      '7': { active: true, lastSeen: 101, connectedPeers: [8] },
      '8': { active: false, lastSeen: 99, connectedPeers: [7] },
    });
    expect(state.mapPolicy).toEqual({
      bounds: { north: 34.0, south: 33.0, west: 35.0, east: 36.0 },
      bufferKm: 2,
      tileRoot: '/tiles',
      offlineRequired: true,
    });
  });

  test('maps snake_case crossing alert fields from backend payload', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      alarm: 'alarm',
      events: [],
      links: [],
      crossing_alert: {
        // Backend payload shape.
        sensor_a: 11,
        sensor_b: 12,
        timestamp: 1_739_742_000,
        lat: null,
        lng: null,
        acknowledged: false,
      } as unknown as never,
      config: { threshold: null, val: null },
    });

    expect(state.crossingAlerts).toEqual([
      {
        sensorA: 11,
        sensorB: 12,
        at: 1_739_742_000,
        lat: null,
        lng: null,
        acknowledged: false,
      },
    ]);
  });

  test('normalizes crossing pair order to ascending ids', () => {
    const state = toMonitorStateFromPayload({
      connected: true,
      port: '/dev/ttyUSB0',
      alarm: 'alarm',
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
      config: { threshold: null, val: null },
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
      alarm: 'alarm',
      events: [],
      links: [],
      crossing_alert: null,
      config: { threshold: null, val: null },
    });

    expect(state.units).toEqual([]);
    expect(state.sensorStatus).toEqual({});
    expect(state.mapPolicy).toEqual({
      bounds: null,
      bufferKm: null,
      tileRoot: null,
      offlineRequired: false,
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

  test('deduplicates crossing alerts within a sliding time window', () => {
    const initial = [
      {
        sensorA: 2,
        sensorB: 12,
        at: 1_000,
        lat: null,
        lng: null,
        acknowledged: false,
      },
    ];
    const duplicate = {
      sensorA: 12,
      sensorB: 2,
      at: 4_000,
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
    expect(deduped[0]?.at).toBe(4_000);
    expect(deduped[0]?.lat).toBe(33.1);
    expect(deduped[0]?.lng).toBe(35.7);

    const appended = mergeCrossingAlerts(deduped, outsideWindow, 5_000, 50);
    expect(appended).toHaveLength(2);
    expect(appended[0]?.at).toBe(12_000);
    expect(appended[1]?.at).toBe(4_000);
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

  test('suppresses same crossing pair within ack sliding window in past and future', () => {
    const windows = addCrossingAckWindow(
      [],
      {
        sensorA: 2,
        sensorB: 12,
        at: 10_000,
        lat: null,
        lng: null,
        acknowledged: false,
      },
      20,
    );

    expect(
      isCrossingAlertSuppressed(
        {
          sensorA: 12,
          sensorB: 2,
          at: 8_500,
          lat: null,
          lng: null,
          acknowledged: false,
        },
        windows,
        2_000,
      ),
    ).toBe(true);

    expect(
      isCrossingAlertSuppressed(
        {
          sensorA: 2,
          sensorB: 12,
          at: 11_500,
          lat: null,
          lng: null,
          acknowledged: false,
        },
        windows,
        2_000,
      ),
    ).toBe(true);

    expect(
      isCrossingAlertSuppressed(
        {
          sensorA: 2,
          sensorB: 12,
          at: 12_500,
          lat: null,
          lng: null,
          acknowledged: false,
        },
        windows,
        2_000,
      ),
    ).toBe(false);
  });

  test('detects stale signal links', () => {
    expect(isSignalFresh({ updatedAt: 1_000 }, 11_000, 10_000)).toBe(false);
    expect(isSignalFresh({ updatedAt: 2_000 }, 11_000, 10_000)).toBe(true);
  });

  test('discovers units from telemetry logs and links', () => {
    const payload = {
      connected: true,
      port: '/dev/cu.usbserial-0001',
      alarm: 'clear' as const,
      events: [
        { time: '21:55:46', msg: 'MAP from 11 ver=0.4c10 gain=32 v=2130' },
        { time: '21:55:46', msg: 'MAP from 12 ver=0.4c10 gain=32 v=2587' },
        { time: '21:55:46', msg: 'MAP from 2 ver=0.4c10 gain=32 v=2112' },
      ],
      links: [
        { side1: 11, side2: 12, quality: 95, intensity: 23, updatedAt: 1 },
      ],
      crossing_alert: null,
      config: { threshold: null, val: null },
    };

    const nextUnits = mergeTelemetryUnits([], payload);
    const ids = nextUnits.map((unit) => unit.id).sort((a, b) => a - b);

    expect(ids).toEqual([2, 11, 12]);
  });

  test('assigns default sensor positions around Mount Hermon', () => {
    const payload = {
      connected: true,
      port: '/dev/cu.usbserial-0001',
      alarm: 'clear' as const,
      events: [
        { time: '21:55:46', msg: 'MAP from 1 ver=0.4c10 gain=32 v=2130' },
      ],
      links: [],
      crossing_alert: null,
      config: { threshold: null, val: null },
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
      alarm: 'clear' as const,
      events: [
        { time: '21:55:46', msg: 'MAP from 2 ver=0.4c10 gain=32 v=2112' },
        { time: '21:55:46', msg: 'MAP from 11 ver=0.4c10 gain=32 v=2130' },
      ],
      links: [],
      crossing_alert: null,
      config: { threshold: null, val: null },
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
});
