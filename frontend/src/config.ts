import { z } from 'zod';

export const DEFAULT_BACKEND_PORT = 8181;
export const SENSOR_STALE_AFTER_SECONDS = 60;
declare const __TPL_BACKEND_PORT__: string | undefined;

const ENV_BACKEND_PORT =
  typeof __TPL_BACKEND_PORT__ === 'string' ? __TPL_BACKEND_PORT__ : undefined;

const PORT_MIN = 1;
const PORT_MAX = 65535;

const backendPortSchema = z.union([
  z.number().int().min(PORT_MIN).max(PORT_MAX),
  z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform((value) => Number(value))
    .pipe(z.number().int().min(PORT_MIN).max(PORT_MAX)),
]);

function toValidPort(value: unknown): number | null {
  const parsed = backendPortSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
