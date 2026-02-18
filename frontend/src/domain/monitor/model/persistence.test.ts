import { describe, expect, test } from 'vitest';
import {
  clearPersistedMonitorConfig,
  loadPersistedMonitorConfig,
  savePersistedMonitorConfig,
} from './persistence';
import type { PairLink, UnitPlacement } from './types';

const store = new Map<string, string>();

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

describe('monitor persistence', () => {
  test('round-trips units and pairings', () => {
    store.clear();
    const units: UnitPlacement[] = [{ id: 1, label: 'U1', lat: 32, lng: 34 }];
    const pairings: PairLink[] = [{ side1Id: 1, side2Id: 2, enabled: true }];
    savePersistedMonitorConfig({
      units,
      pairings,
      globalSettings: { alarmSoundEnabled: false, offlineModeEnabled: false },
    });

    const loaded = loadPersistedMonitorConfig();

    expect(loaded.units).toEqual(units);
    expect(loaded.pairings).toEqual(pairings);
    expect(loaded.globalSettings).toEqual({
      alarmSoundEnabled: false,
      offlineModeEnabled: false,
    });
  });

  test('returns defaults when payload is invalid', () => {
    store.clear();
    localStorage.setItem('monitor:persisted:v1', '{bad json');

    const loaded = loadPersistedMonitorConfig();

    expect(loaded).toEqual({
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    });
  });

  test('drops invalid pairing payloads', () => {
    store.clear();
    localStorage.setItem(
      'monitor:persisted:v1',
      JSON.stringify({
        units: [],
        pairings: [{ side1Id: 12, enabled: true }],
      }),
    );

    const loaded = loadPersistedMonitorConfig();

    expect(loaded.pairings).toEqual([]);
  });

  test('clears persisted monitor config', () => {
    store.clear();
    savePersistedMonitorConfig({
      units: [{ id: 1, label: 'U1', lat: 32, lng: 34 }],
      pairings: [{ side1Id: 1, side2Id: 2, enabled: true }],
      globalSettings: { alarmSoundEnabled: false, offlineModeEnabled: false },
    });

    clearPersistedMonitorConfig();

    expect(loadPersistedMonitorConfig()).toEqual({
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
    });
  });
});
