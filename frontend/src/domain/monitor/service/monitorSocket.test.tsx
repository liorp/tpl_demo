// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
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
    const { unmount } = render(<Harness />);

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

    render(<StateHarness onState={onState} />);

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
    render(<StateHarness onState={onState} onApi={onApi} />);

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
    render(<StateHarness onState={onState} />);

    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();
    socket.emitMessage({
      connected: true,
      port: '/dev/ttyUSB0',
      alarm: 'clear',
      events: [
        { time: '21:55:46', msg: 'MAP from 99 ver=0.4c10 gain=32 v=2112' },
      ],
      links: [],
      crossing_alert: null,
      config: { threshold: null, val: null },
      units: [{ id: 7, label: 'S7', lat: 33.31, lng: 35.78 }],
      sensor_status: {
        '7': { active: true, last_seen: 100, connected_peers: [] },
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
        '7': { active: true, lastSeen: 100, connectedPeers: [] },
      });
      expect(latestState.mapPolicy.tileRoot).toBe('/tiles');
    });
  });
});
