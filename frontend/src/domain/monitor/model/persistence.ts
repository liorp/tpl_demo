import { z } from 'zod';

import type { PairLink, UnitPlacement } from './types';

const KEY = 'monitor:persisted:v1';

type PersistedMonitorConfig = {
  units: UnitPlacement[];
  pairings: PairLink[];
  globalSettings: {
    alarmSoundEnabled: boolean;
    offlineModeEnabled: boolean;
  };
};

const EMPTY: PersistedMonitorConfig = {
  units: [],
  pairings: [],
  globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
};

const finiteNumberSchema = z.number().refine(Number.isFinite);
const persistedUnitSchema = z
  .object({
    id: finiteNumberSchema.int(),
    label: z.string(),
    lat: finiteNumberSchema,
    lng: finiteNumberSchema,
    status: z.enum(['active', 'inactive', 'stale']).optional(),
    lastSeenAt: finiteNumberSchema.optional(),
  })
  .passthrough();
const persistedPairingSchema = z
  .object({
    side1Id: finiteNumberSchema.int(),
    side2Id: finiteNumberSchema.int(),
    enabled: z.boolean(),
  })
  .passthrough();
const persistedGlobalSettingsSchema = z
  .object({
    alarmSoundEnabled: z.boolean().optional(),
    offlineModeEnabled: z.boolean().optional(),
  })
  .passthrough();
const persistedRootSchema = z
  .object({
    units: z.array(z.unknown()),
    pairings: z.array(z.unknown()).optional(),
    globalSettings: z.unknown().optional(),
  })
  .passthrough();

function normalizePairings(value: unknown): PairLink[] {
  const rawPairings = z.array(z.unknown()).safeParse(value);
  if (!rawPairings.success) {
    return [];
  }

  return rawPairings.data.flatMap((entry) => {
    const parsed = persistedPairingSchema.safeParse(entry);
    if (!parsed.success) {
      return [];
    }

    const enabled = parsed.data.enabled === true;
    if (!enabled || parsed.data.side1Id === parsed.data.side2Id) {
      return [];
    }

    const side1Id = Math.min(parsed.data.side1Id, parsed.data.side2Id);
    const side2Id = Math.max(parsed.data.side1Id, parsed.data.side2Id);
    return [{ side1Id, side2Id, enabled: true }];
  });
}

function normalizeUnits(value: unknown): UnitPlacement[] {
  const rawUnits = z.array(z.unknown()).safeParse(value);
  if (!rawUnits.success) {
    return [];
  }

  return rawUnits.data.flatMap((entry) => {
    const parsed = persistedUnitSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function normalizeGlobalSettings(
  value: unknown,
): PersistedMonitorConfig['globalSettings'] {
  const parsed = persistedGlobalSettingsSchema.safeParse(value);
  if (!parsed.success) {
    return EMPTY.globalSettings;
  }

  return {
    alarmSoundEnabled: parsed.data.alarmSoundEnabled ?? true,
    offlineModeEnabled: parsed.data.offlineModeEnabled ?? true,
  };
}

export function loadPersistedMonitorConfig(): PersistedMonitorConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return EMPTY;
    }
    const parsedJson: unknown = JSON.parse(raw);
    const parsed = persistedRootSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return EMPTY;
    }
    return {
      units: normalizeUnits(parsed.data.units),
      pairings: normalizePairings(parsed.data.pairings),
      globalSettings: normalizeGlobalSettings(parsed.data.globalSettings),
    };
  } catch {
    return EMPTY;
  }
}

export function savePersistedMonitorConfig(
  value: PersistedMonitorConfig,
): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}

export function clearPersistedMonitorConfig(): void {
  localStorage.removeItem(KEY);
}
