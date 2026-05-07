import { describe, expect, test } from 'vitest';
import type { Annotation } from './annotations';
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
      annotations: [],
    });

    const loaded = loadPersistedMonitorConfig();

    expect(loaded.units).toEqual(units);
    expect(loaded.pairings).toEqual(pairings);
    expect(loaded.globalSettings).toEqual({
      alarmSoundEnabled: false,
      offlineModeEnabled: false,
    });
    expect(loaded.annotations).toEqual([]);
  });

  test('round-trips annotations', () => {
    store.clear();
    const annotations: Annotation[] = [
      {
        type: 'pen',
        id: 'pen-1',
        points: [
          [33.31, 35.78],
          [33.32, 35.79],
        ],
        color: '#ef4444',
        width: 3,
        createdAt: 1_700_000_000_000,
      },
      {
        type: 'text',
        id: 'text-1',
        position: [33.31, 35.78],
        text: 'Landmark',
        color: '#facc15',
        size: 14,
        createdAt: 1_700_000_000_001,
      },
    ];
    savePersistedMonitorConfig({
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
      annotations,
    });

    const loaded = loadPersistedMonitorConfig();

    expect(loaded.annotations).toEqual(annotations);
  });

  test('loads legacy payload without annotations as empty array', () => {
    store.clear();
    localStorage.setItem(
      'monitor:persisted:v1',
      JSON.stringify({
        units: [{ id: 1, label: 'U1', lat: 32, lng: 34 }],
        pairings: [{ side1Id: 1, side2Id: 2, enabled: true }],
        globalSettings: { alarmSoundEnabled: false, offlineModeEnabled: false },
      }),
    );

    const loaded = loadPersistedMonitorConfig();

    expect(loaded.annotations).toEqual([]);
    expect(loaded.units).toHaveLength(1);
  });

  test('drops malformed annotation entries', () => {
    store.clear();
    localStorage.setItem(
      'monitor:persisted:v1',
      JSON.stringify({
        units: [],
        pairings: [],
        globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
        annotations: [
          {
            type: 'pen',
            id: 'good',
            points: [
              [33.31, 35.78],
              [33.32, 35.79],
            ],
            color: '#fff',
            width: 3,
            createdAt: 1,
          },
          { type: 'rectangle', id: 'bad' },
          {
            type: 'text',
            id: 'good-text',
            position: [33.31, 35.78],
            text: 'Hi',
            color: '#fff',
            size: 14,
            createdAt: 2,
          },
        ],
      }),
    );

    const loaded = loadPersistedMonitorConfig();

    expect(loaded.annotations.map((a) => a.id)).toEqual(['good', 'good-text']);
  });

  test('returns defaults when payload is invalid', () => {
    store.clear();
    localStorage.setItem('monitor:persisted:v1', '{bad json');

    const loaded = loadPersistedMonitorConfig();

    expect(loaded).toEqual({
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
      annotations: [],
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

  test('drops non-finite persisted unit and pairing values', () => {
    store.clear();
    localStorage.setItem(
      'monitor:persisted:v1',
      JSON.stringify({
        units: [
          { id: 1, label: 'U1', lat: 33.1, lng: 35.1 },
          { id: 2, label: 'U2', lat: Number.NaN, lng: 35.2 },
        ],
        pairings: [
          { side1Id: 1, side2Id: 2, enabled: true },
          { side1Id: Number.NaN, side2Id: 3, enabled: true },
        ],
      }),
    );

    const loaded = loadPersistedMonitorConfig();

    expect(loaded.units).toEqual([
      { id: 1, label: 'U1', lat: 33.1, lng: 35.1 },
    ]);
    expect(loaded.pairings).toEqual([
      { side1Id: 1, side2Id: 2, enabled: true },
    ]);
  });

  test('clears persisted monitor config', () => {
    store.clear();
    savePersistedMonitorConfig({
      units: [{ id: 1, label: 'U1', lat: 32, lng: 34 }],
      pairings: [{ side1Id: 1, side2Id: 2, enabled: true }],
      globalSettings: { alarmSoundEnabled: false, offlineModeEnabled: false },
      annotations: [],
    });

    clearPersistedMonitorConfig();

    expect(loadPersistedMonitorConfig()).toEqual({
      units: [],
      pairings: [],
      globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
      annotations: [],
    });
  });
});
