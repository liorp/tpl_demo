import { describe, expect, test } from 'vitest';
import {
  createBackendWebSocketUrl,
  DEFAULT_BACKEND_PORT,
  resolveBackendPort,
} from '@/config';

describe('frontend runtime config', () => {
  test('uses hardcoded backend port by default', () => {
    expect(resolveBackendPort(undefined)).toBe(DEFAULT_BACKEND_PORT);
  });

  test('accepts numeric backend port override', () => {
    expect(resolveBackendPort(8099)).toBe(8099);
  });

  test('accepts string backend port override', () => {
    expect(resolveBackendPort('8098')).toBe(8098);
  });

  test('falls back to default for invalid override', () => {
    expect(resolveBackendPort('abc')).toBe(DEFAULT_BACKEND_PORT);
    expect(resolveBackendPort(0)).toBe(DEFAULT_BACKEND_PORT);
    expect(resolveBackendPort(70000)).toBe(DEFAULT_BACKEND_PORT);
    expect(resolveBackendPort('8098.1')).toBe(DEFAULT_BACKEND_PORT);
    expect(resolveBackendPort('8098abc')).toBe(DEFAULT_BACKEND_PORT);
    expect(resolveBackendPort('')).toBe(DEFAULT_BACKEND_PORT);
  });

  test('builds websocket URL from protocol, host, and configured port', () => {
    const url = createBackendWebSocketUrl(
      {
        location: {
          protocol: 'http:',
          hostname: '127.0.0.1',
        },
      },
      '/ws',
      8090,
    );

    expect(url).toBe('ws://127.0.0.1:8090/ws');
  });
});
