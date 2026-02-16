import { describe, expect, test } from 'vitest';

import { getUnitBounds } from './mapViewport';

describe('map viewport', () => {
  test('returns null when there are no units', () => {
    expect(getUnitBounds([])).toBeNull();
  });

  test('returns min/max bounds for units', () => {
    const bounds = getUnitBounds([
      { id: 11, label: 'S11', lat: 32.011, lng: 34.822 },
      { id: 12, label: 'S12', lat: 32.102, lng: 35.001 },
      { id: 2, label: 'S2', lat: 31.912, lng: 34.755 },
    ]);

    expect(bounds).toEqual([
      [31.912, 34.755],
      [32.102, 35.001],
    ]);
  });
});
