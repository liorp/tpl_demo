import type { PairLink, UnitPlacement } from './types';

const KEY = 'monitor:persisted:v1';

type PersistedMonitorConfig = {
  units: UnitPlacement[];
  pairings: PairLink[];
};

const EMPTY: PersistedMonitorConfig = { units: [], pairings: [] };

function normalizePairings(value: unknown): PairLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const candidate = entry as Record<string, unknown>;
    const side1IdRaw = candidate.side1Id;
    const side2IdRaw = candidate.side2Id;
    const enabled = candidate.enabled === true;
    if (
      typeof side1IdRaw !== 'number' ||
      typeof side2IdRaw !== 'number' ||
      !enabled ||
      side1IdRaw === side2IdRaw
    ) {
      return [];
    }

    const side1Id = Math.min(side1IdRaw, side2IdRaw);
    const side2Id = Math.max(side1IdRaw, side2IdRaw);
    return [{ side1Id, side2Id, enabled: true }];
  });
}

export function loadPersistedMonitorConfig(): PersistedMonitorConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return EMPTY;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedMonitorConfig>;
    if (!Array.isArray(parsed.units)) {
      return EMPTY;
    }
    return {
      units: parsed.units,
      pairings: normalizePairings(parsed.pairings),
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
