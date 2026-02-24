export const DEFAULT_BACKEND_PORT = 8080;
export const SENSOR_STALE_AFTER_SECONDS = 60;
declare const __TPL_BACKEND_PORT__: string | undefined;

const ENV_BACKEND_PORT =
  typeof __TPL_BACKEND_PORT__ === 'string' ? __TPL_BACKEND_PORT__ : undefined;

function toValidPort(value: unknown): number | null {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0 && value <= 65535) {
      return value;
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }

  return null;
}

export function resolveBackendPort(override: unknown): number {
  return toValidPort(override) ?? DEFAULT_BACKEND_PORT;
}

export function createBackendWebSocketUrl(
  runtime: {
    location: {
      protocol: string;
      hostname: string;
    };
  },
  path = '/ws',
  portOverride: unknown = ENV_BACKEND_PORT,
): string {
  const protocol = runtime.location.protocol === 'https:' ? 'wss' : 'ws';
  const port = resolveBackendPort(portOverride);
  return `${protocol}://${runtime.location.hostname}:${port}${path}`;
}

export function createAppWebSocketUrl(path = '/ws'): string {
  return createBackendWebSocketUrl(window, path);
}
