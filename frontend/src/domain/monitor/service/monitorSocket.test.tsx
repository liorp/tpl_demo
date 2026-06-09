// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useMonitorSocket } from './monitorSocket';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitMessage(payload: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(payload) }),
    );
  }

  emitClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function Harness() {
  useMonitorSocket();
  return null;
}

function StateHarness({
  onState,
  onApi,
}: {
  onState: ReturnType<typeof vi.fn>;
  onApi?: ReturnType<typeof vi.fn>;
}) {
  const api = useMonitorSocket();
  const { state } = api;
  useEffect(() => {
    onState(state);
  }, [onState, state]);
  useEffect(() => {
    onApi?.(api);
  }, [api, onApi]);
  return null;
}

describe('monitor socket lifecycle', () => {
  const originalWebSocket = globalThis.WebSocket;
  const store = new Map<string, string>();

  beforeEach(() => {
    FakeWebSocket.instances = [];
    // @ts-expect-error test double
    globalThis.WebSocket = FakeWebSocket;
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      configurable: true,
    });
    store.clear();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  test('defers close until open when unmounted during connecting state', () => {
    const { unmount } = render(
      <TestWrapper>
        <Harness />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    unmount();
    expect(socket.close).not.toHaveBeenCalled();

    socket.emitOpen();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  test('loads persisted units and pairings on startup', () => {
    const onState = vi.fn();
    localStorage.setItem(
      'monitor:persisted:v1',
      JSON.stringify({
        units: [{ id: 7, label: 'S7', lat: 33.31, lng: 35.78 }],
        pairings: [{ side1Id: 7, side2Id: 8, enabled: true }],
        globalSettings: {
          alarmSoundEnabled: false,
          offlineModeEnabled: false,
        },
      }),
    );

    render(
      <TestWrapper>
        <StateHarness onState={onState} />
      </TestWrapper>,
    );

    expect(onState).toHaveBeenCalled();
    const firstState = onState.mock.calls[0][0] as {
      units: Array<{ id: number }>;
      pairings: Array<{ side1Id: number; side2Id: number; enabled: boolean }>;
      globalSettings: {
        alarmSoundEnabled: boolean;
        offlineModeEnabled: boolean;
      };
    };
    expect(firstState.units).toEqual([
      { id: 7, label: 'S7', lat: 33.31, lng: 35.78 },
    ]);
    expect(firstState.pairings).toEqual([
      { side1Id: 7, side2Id: 8, enabled: true },
    ]);
    expect(firstState.globalSettings).toEqual({
      alarmSoundEnabled: false,
      offlineModeEnabled: false,
    });
  });

  test('placeUnit sends set_unit_position command and applies optimistic unit update', async () => {
    const onState = vi.fn();
    const onApi = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} onApi={onApi} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();

    const latestApi = onApi.mock.calls.at(-1)?.[0] as {
      placeUnit: (unit: {
        id: number;
        label: string;
        lat: number;
        lng: number;
      }) => void;
    };
    latestApi.placeUnit({ id: 7, label: 'S7', lat: 33.31, lng: 35.78 });

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        cmd: 'set_unit_position',
        unit_id: 7,
        lat: 33.31,
        lng: 35.78,
      }),
    );

    await waitFor(() => {
      const latestState = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{ id: number; lat: number; lng: number }>;
      };
      expect(latestState.units).toEqual([
        { id: 7, label: 'S7', lat: 33.31, lng: 35.78 },
      ]);
    });
  });

  test('uses backend units payload when available', async () => {
    const onState = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [
        { time: '21:55:46', msg: 'MAP from 99 ver=0.4c10 gain=32 v=2112' },
      ],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 7, label: 'S7', lat: 33.31, lng: 35.78 }],
      sensor_status: {
        '7': { last_seen: 100, connected_peers: [8] },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    await waitFor(() => {
      const latestState = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{ id: number }>;
        sensorStatus: Record<string, unknown>;
        mapPolicy: { tileRoot: string | null };
      };

      expect(latestState.units).toEqual([
        {
          id: 7,
          label: 'S7',
          lat: 33.31,
          lng: 35.78,
          status: 'active',
          lastSeenAt: 100,
        },
      ]);
      expect(latestState.sensorStatus).toEqual({
        '7': {
          lastSeen: 100,
          connectedPeers: [8],
          activeAntenna: null,
          supportedAntennas: null,
          voltage: null,
          version: null,
        },
      });
      expect(latestState.mapPolicy.tileRoot).toBe('/tiles');
    });
  });

  test('ignores malformed websocket payloads that do not match monitor envelope', async () => {
    const onState = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      config: 'not-an-object',
    });

    await waitFor(() => {
      const latestState = onState.mock.calls.at(-1)?.[0] as {
        connected: boolean;
        port: string;
      };
      expect(latestState.connected).toBe(false);
      expect(latestState.port).toBe('None');
    });
  });

  test('reflects connection state from websocket payload data', async () => {
    const onState = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [],
      sensor_status: {},
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    await waitFor(() => {
      const latestState = onState.mock.calls.at(-1)?.[0] as {
        connected: boolean;
        port: string;
      };
      expect(latestState.connected).toBe(true);
      expect(latestState.port).toBe('/dev/ttyUSB0');
    });
  });

  test('derives alarms from detection events, then clears and re-arms a dismissed pair only after the crossing ends', async () => {
    vi.useFakeTimers();
    try {
      const onState = vi.fn();
      const onApi = vi.fn();
      render(
        <TestWrapper>
          <StateHarness onState={onState} onApi={onApi} />
        </TestWrapper>,
      );

      const socket = FakeWebSocket.instances[0];
      await act(async () => {
        socket.emitOpen();
      });

      // A snapshot whose event log optionally carries one 11-12 detection.
      const snapshot = (
        detection: { time: string; value: number; deviceTs: number } | null,
        port = '/dev/ttyUSB0',
      ) => ({
        connected: true,
        port,
        events: detection
          ? [
              {
                time: detection.time,
                msg: `DETECTION 11-12 th=500 val=${detection.value}`,
                type: 'detection',
                unit_a: 11,
                unit_b: 12,
                value: detection.value,
                threshold: 500,
                device_ts: detection.deviceTs,
              },
            ]
          : [],
        links: [],
        config: { gain: null },
        units: [
          { id: 11, label: 'S11', lat: 33.31, lng: 35.78 },
          { id: 12, label: 'S12', lat: 33.32, lng: 35.79 },
        ],
        sensor_status: {},
        map_policy: {
          bounds: null,
          buffer_km: null,
          tile_root: '/tiles',
          offline_required: false,
        },
      });

      const latestState = () =>
        onState.mock.calls.at(-1)?.[0] as {
          crossingAlerts: Array<{
            sensorA: number;
            sensorB: number;
            at: number;
          }>;
          pairings: unknown[];
          units: Array<{ id: number }>;
          port: string;
        };
      const latestApi = () =>
        onApi.mock.calls.at(-1)?.[0] as {
          acknowledgeCrossing: (alert: {
            sensorA: number;
            sensorB: number;
            at: number;
          }) => void;
          setUnitPairing: (a: number, b: number, enabled: boolean) => void;
        };

      // Baseline snapshot (no detection): registers units and seeds signatures.
      await act(async () => {
        socket.emitMessage(snapshot(null));
      });
      expect(latestState().units.map((u) => u.id)).toContain(11);

      // Enable the 11-12 pair so its crossings reach the banner.
      await act(async () => {
        latestApi().setUnitPairing(11, 12, true);
      });
      expect(latestState().pairings).toHaveLength(1);

      // 1) A detection event for the enabled pair -> banner shows.
      await act(async () => {
        socket.emitMessage(
          snapshot({ time: '20:00:01', value: 860, deviceTs: 1 }),
        );
      });
      expect(latestState().crossingAlerts).toHaveLength(1);

      // 2) Operator dismisses -> banner hidden.
      const active = latestState().crossingAlerts[0];
      await act(async () => {
        latestApi().acknowledgeCrossing(active);
      });
      expect(latestState().crossingAlerts).toHaveLength(0);

      // 3) Same detection re-sent in a later snapshot -> stays hidden. Bump the
      //    port to prove the snapshot was processed without re-alarming.
      await act(async () => {
        socket.emitMessage(
          snapshot(
            { time: '20:00:01', value: 860, deviceTs: 1 },
            '/dev/ttyUSB1',
          ),
        );
      });
      expect(latestState().port).toBe('/dev/ttyUSB1');
      expect(latestState().crossingAlerts).toHaveLength(0);

      // 4) Crossing goes quiet past the clear window -> the timer clears the
      //    alarm state and drops the dismissal.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_500);
      });

      // 5) A genuinely fresh detection (new signature) for the same pair alarms.
      await act(async () => {
        socket.emitMessage(
          snapshot(
            { time: '20:00:10', value: 900, deviceTs: 2 },
            '/dev/ttyUSB1',
          ),
        );
      });
      expect(latestState().crossingAlerts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('broadcast with old position does not overwrite optimistic placeUnit update', async () => {
    const onState = vi.fn();
    const onApi = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} onApi={onApi} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();

    // Backend sends initial state with unit at original position
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 7, label: 'S7', lat: 33.31, lng: 35.78 }],
      sensor_status: {
        '7': { last_seen: 100, connected_peers: [8] },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{ id: number; lat: number; lng: number }>;
      };
      expect(latest.units[0]?.lat).toBe(33.31);
    });

    // User moves unit to new position
    const latestApi = onApi.mock.calls.at(-1)?.[0] as {
      placeUnit: (unit: {
        id: number;
        label: string;
        lat: number;
        lng: number;
      }) => void;
    };
    latestApi.placeUnit({ id: 7, label: 'S7', lat: 33.4, lng: 35.85 });

    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{ id: number; lat: number; lng: number }>;
      };
      expect(latest.units[0]?.lat).toBe(33.4);
    });

    // A serial-event broadcast arrives with the OLD position
    // (snapshot was taken before backend processed set_unit_position)
    // Uses a new last_seen to prove the broadcast was processed.
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 7, label: 'S7', lat: 33.31, lng: 35.78 }],
      sensor_status: {
        '7': { last_seen: 101, connected_peers: [8] },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    // Wait for the stale broadcast to be fully processed
    // (lastSeenAt update proves the message was applied)
    // THEN verify the optimistic position was preserved
    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{
          id: number;
          lat: number;
          lng: number;
          lastSeenAt: number;
        }>;
      };
      expect(latest.units[0]?.lastSeenAt).toBe(101);
      expect(latest.units[0]?.lat).toBe(33.4);
      expect(latest.units[0]?.lng).toBe(35.85);
    });
  });

  test('pending position clears once server confirms the new coordinates', async () => {
    const onState = vi.fn();
    const onApi = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} onApi={onApi} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();

    // Initial state
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 7, label: 'S7', lat: 33.31, lng: 35.78 }],
      sensor_status: {
        '7': { last_seen: 100, connected_peers: [8] },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{ id: number; lat: number; lng: number }>;
      };
      expect(latest.units[0]?.lat).toBe(33.31);
    });

    // User moves unit
    const latestApi = onApi.mock.calls.at(-1)?.[0] as {
      placeUnit: (unit: {
        id: number;
        label: string;
        lat: number;
        lng: number;
      }) => void;
    };
    latestApi.placeUnit({ id: 7, label: 'S7', lat: 33.4, lng: 35.85 });

    // Server confirms with matching position
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 7, label: 'S7', lat: 33.4, lng: 35.85 }],
      sensor_status: {
        '7': { last_seen: 102, connected_peers: [8] },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{
          id: number;
          lat: number;
          lng: number;
          lastSeenAt: number;
        }>;
      };
      expect(latest.units[0]?.lat).toBe(33.4);
      expect(latest.units[0]?.lng).toBe(35.85);
      // sensor status should be updated from the confirming broadcast
      expect(latest.units[0]?.lastSeenAt).toBe(102);
    });

    // Subsequent broadcast with server position should be accepted now
    // (pending was cleared on confirmation)
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 7, label: 'S7', lat: 33.4, lng: 35.85 }],
      sensor_status: {
        '7': { last_seen: 103, connected_peers: [8] },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{ id: number; lastSeenAt: number }>;
      };
      expect(latest.units[0]?.lastSeenAt).toBe(103);
    });
  });

  test('placeUnit does not create stale pending position when socket is not open', async () => {
    const onState = vi.fn();
    const onApi = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} onApi={onApi} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];

    const latestApi = onApi.mock.calls.at(-1)?.[0] as {
      placeUnit: (unit: {
        id: number;
        label: string;
        lat: number;
        lng: number;
      }) => void;
    };
    latestApi.placeUnit({ id: 7, label: 'S7', lat: 33.4, lng: 35.85 });
    expect(socket.send).not.toHaveBeenCalled();

    socket.emitOpen();
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 7, label: 'S7', lat: 33.31, lng: 35.78 }],
      sensor_status: {
        '7': { last_seen: 101, connected_peers: [8] },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        units: Array<{ id: number; lat: number; lng: number }>;
      };
      expect(latest.units[0]?.lat).toBe(33.31);
      expect(latest.units[0]?.lng).toBe(35.78);
    });
  });

  test('annotation actions add, update, remove, clear and persist', async () => {
    const onApi = vi.fn();
    const onState = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} onApi={onApi} />
      </TestWrapper>,
    );

    type AnnotationsApi = {
      addAnnotation: (a: unknown) => void;
      updateAnnotation: (id: string, patch: unknown) => void;
      removeAnnotation: (id: string) => void;
      clearAnnotations: () => void;
      undoAnnotation: () => void;
      redoAnnotation: () => void;
      canUndoAnnotations: boolean;
      canRedoAnnotations: boolean;
    };
    const api = () => onApi.mock.calls.at(-1)?.[0] as AnnotationsApi;
    const lastAnnotations = () =>
      (
        onState.mock.calls.at(-1)?.[0] as {
          annotations: Array<{ id: string; type: string }>;
        }
      ).annotations;
    const persisted = () =>
      JSON.parse(store.get('monitor:persisted:v1') ?? '{}') as {
        annotations: Array<{ id: string }>;
      };

    api().addAnnotation({
      type: 'pen',
      id: 'a1',
      points: [
        [33.3, 35.7],
        [33.31, 35.71],
      ],
      color: '#ef4444',
      width: 3,
      createdAt: 1,
    });

    await waitFor(() => {
      expect(lastAnnotations().map((a) => a.id)).toEqual(['a1']);
    });
    expect(persisted().annotations.map((a) => a.id)).toEqual(['a1']);

    api().updateAnnotation('a1', { color: '#00ff00' });
    await waitFor(() => {
      expect((lastAnnotations()[0] as unknown as { color: string }).color).toBe(
        '#00ff00',
      );
    });

    api().addAnnotation({
      type: 'text',
      id: 'a2',
      position: [33.3, 35.7],
      text: 'Hi',
      color: '#fff',
      size: 14,
      createdAt: 2,
    });
    await waitFor(() => {
      expect(lastAnnotations().map((a) => a.id)).toEqual(['a1', 'a2']);
    });

    api().removeAnnotation('a1');
    await waitFor(() => {
      expect(lastAnnotations().map((a) => a.id)).toEqual(['a2']);
    });
    expect(persisted().annotations.map((a) => a.id)).toEqual(['a2']);

    expect(api().canUndoAnnotations).toBe(true);
    api().undoAnnotation();
    await waitFor(() => {
      expect(lastAnnotations().map((a) => a.id)).toEqual(['a1', 'a2']);
    });
    expect(api().canRedoAnnotations).toBe(true);

    api().redoAnnotation();
    await waitFor(() => {
      expect(lastAnnotations().map((a) => a.id)).toEqual(['a2']);
    });

    api().clearAnnotations();
    await waitFor(() => {
      expect(lastAnnotations()).toEqual([]);
    });
    expect(persisted().annotations).toEqual([]);
  });

  test('resetAll clears annotations along with units and pairings', async () => {
    const onApi = vi.fn();
    const onState = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} onApi={onApi} />
      </TestWrapper>,
    );

    type ApiShape = {
      addAnnotation: (a: unknown) => void;
      resetAll: () => void;
    };
    const api = () => onApi.mock.calls.at(-1)?.[0] as ApiShape;
    const lastAnnotations = () =>
      (
        onState.mock.calls.at(-1)?.[0] as {
          annotations: Array<{ id: string }>;
        }
      ).annotations;

    api().addAnnotation({
      type: 'pen',
      id: 'r1',
      points: [
        [33.3, 35.7],
        [33.31, 35.71],
      ],
      color: '#ef4444',
      width: 3,
      createdAt: 1,
    });
    await waitFor(() => {
      expect(lastAnnotations()).toHaveLength(1);
    });

    api().resetAll();
    await waitFor(() => {
      expect(lastAnnotations()).toEqual([]);
    });
  });

  test('keeps active socket usable when stale socket closes in Strict Mode', async () => {
    const onApi = vi.fn();
    render(
      <StrictMode>
        <TestWrapper>
          <StateHarness onState={vi.fn()} onApi={onApi} />
        </TestWrapper>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    });

    const firstSocket = FakeWebSocket.instances[0];
    const secondSocket = FakeWebSocket.instances[1];
    expect(firstSocket).toBeDefined();
    expect(secondSocket).toBeDefined();

    secondSocket?.emitOpen();
    firstSocket?.emitClose();

    const latestApi = onApi.mock.calls.at(-1)?.[0] as {
      sendPairThreshold: (a: number, b: number, value: number) => boolean;
    } & Record<string, unknown>;
    expect(latestApi.sendPairThreshold(11, 12, 600)).toBe(true);
    expect(secondSocket?.send).toHaveBeenCalledWith(
      JSON.stringify({
        cmd: 'set_threshold',
        unit_a: 11,
        unit_b: 12,
        value: 600,
      }),
    );
    expect('sendDetectionThreshold' in latestApi).toBe(false);
  });

  test('exposes new AT commands: ping, antenna, detection mode, reset', async () => {
    const onApi = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={vi.fn()} onApi={onApi} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();

    const api = onApi.mock.calls.at(-1)?.[0] as {
      sendPing: (unit?: number) => boolean;
      sendSetActiveAntenna: (unit: number, antenna: 1 | 2) => boolean;
      sendRequestActiveAntenna: (unit?: number) => boolean;
      sendSetDetectionMode: (mode: 1 | 2) => boolean;
      sendRequestDetectionMode: () => boolean;
      sendReset: () => boolean;
      sendPairGain: (a: number, b: number, value: number) => boolean;
    };

    expect(api.sendPing()).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ cmd: 'ping', unit: 0 }),
    );
    expect(api.sendSetActiveAntenna(11, 2)).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ cmd: 'set_active_antenna', unit: 11, antenna: 2 }),
    );
    expect(api.sendRequestActiveAntenna()).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ cmd: 'request_active_antenna', unit: 0 }),
    );
    expect(api.sendSetDetectionMode(2)).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ cmd: 'set_detection_mode', mode: 2 }),
    );
    expect(api.sendRequestDetectionMode()).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ cmd: 'request_detection_mode' }),
    );
    expect(api.sendReset()).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ cmd: 'reset' }));
    expect(api.sendPairGain(11, 12, 64)).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ cmd: 'set_gain', unit_a: 11, unit_b: 12, value: 64 }),
    );
  });

  test('antenna selection updates optimistically and survives snapshots that omit antenna state', async () => {
    const onState = vi.fn();
    const onApi = vi.fn();
    render(
      <TestWrapper>
        <StateHarness onState={onState} onApi={onApi} />
      </TestWrapper>,
    );

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();

    const snapshot = (lastSeen: number, activeAntenna?: 1 | 2) => ({
      connected: true,
      port: '/dev/ttyUSB0',
      events: [],
      links: [],
      crossing_alert: null,
      config: { gain: null },
      units: [{ id: 11, label: 'S11', lat: 33.31, lng: 35.78 }],
      sensor_status: {
        '11': {
          last_seen: lastSeen,
          connected_peers: [12],
          ...(activeAntenna ? { active_antenna: activeAntenna } : {}),
        },
      },
      map_policy: {
        bounds: null,
        buffer_km: null,
        tile_root: '/tiles',
        offline_required: false,
      },
    });

    // Device reports the unit but never an active antenna.
    socket.emitMessage(snapshot(100));
    const antennaOf = () =>
      (
        onState.mock.calls.at(-1)?.[0] as {
          sensorStatus: Record<string, { activeAntenna: 1 | 2 | null }>;
        }
      ).sensorStatus['11']?.activeAntenna;
    await waitFor(() => expect(antennaOf()).toBeNull());

    // User picks External (2): command is sent and the UI reflects it at once.
    const api = onApi.mock.calls.at(-1)?.[0] as {
      sendSetActiveAntenna: (unit: number, antenna: 1 | 2) => boolean;
    };
    expect(api.sendSetActiveAntenna(11, 2)).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ cmd: 'set_active_antenna', unit: 11, antenna: 2 }),
    );
    await waitFor(() => expect(antennaOf()).toBe(2));

    // A later snapshot that still omits the antenna must NOT clear the choice.
    socket.emitMessage(snapshot(101));
    await waitFor(() => {
      const latest = onState.mock.calls.at(-1)?.[0] as {
        sensorStatus: Record<string, { lastSeen: number | null }>;
      };
      expect(latest.sensorStatus['11']?.lastSeen).toBe(101);
    });
    expect(antennaOf()).toBe(2);
  });
});
