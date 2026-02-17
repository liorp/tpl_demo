// @vitest-environment jsdom

import { render } from '@testing-library/react';
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
}

function Harness() {
  useMonitorSocket();
  return null;
}

function StateHarness({ onState }: { onState: ReturnType<typeof vi.fn> }) {
  const { state } = useMonitorSocket();
  useEffect(() => {
    onState(state);
  }, [onState, state]);
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
      }),
    );

    render(<StateHarness onState={onState} />);

    expect(onState).toHaveBeenCalled();
    const firstState = onState.mock.calls[0][0] as {
      units: Array<{ id: number }>;
      pairings: Array<{ side1Id: number; side2Id: number; enabled: boolean }>;
    };
    expect(firstState.units).toEqual([
      { id: 7, label: 'S7', lat: 33.31, lng: 35.78 },
    ]);
    expect(firstState.pairings).toEqual([
      { side1Id: 7, side2Id: 8, enabled: true },
    ]);
  });
});
