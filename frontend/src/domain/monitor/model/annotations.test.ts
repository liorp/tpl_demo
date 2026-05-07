import { describe, expect, test } from 'vitest';

import { annotationSchema } from './annotations';

describe('annotation schema', () => {
  test('accepts a valid pen annotation', () => {
    const parsed = annotationSchema.safeParse({
      type: 'pen',
      id: 'pen-1',
      points: [
        [33.31, 35.78],
        [33.32, 35.79],
      ],
      color: '#ef4444',
      width: 3,
      createdAt: 1_700_000_000_000,
    });

    expect(parsed.success).toBe(true);
  });

  test('accepts a valid text annotation', () => {
    const parsed = annotationSchema.safeParse({
      type: 'text',
      id: 'text-1',
      position: [33.31, 35.78],
      text: 'Landmark',
      color: '#facc15',
      size: 14,
      createdAt: 1_700_000_000_000,
    });

    expect(parsed.success).toBe(true);
  });

  test('rejects annotations with unknown type', () => {
    const parsed = annotationSchema.safeParse({
      type: 'rectangle',
      id: 'r-1',
      color: '#fff',
    });

    expect(parsed.success).toBe(false);
  });

  test('rejects pen annotations with non-numeric points', () => {
    const parsed = annotationSchema.safeParse({
      type: 'pen',
      id: 'pen-bad',
      points: [[Number.NaN, 35.78]],
      color: '#ef4444',
      width: 3,
      createdAt: 1,
    });

    expect(parsed.success).toBe(false);
  });

  test('rejects text annotations with empty text', () => {
    const parsed = annotationSchema.safeParse({
      type: 'text',
      id: 'text-bad',
      position: [33.31, 35.78],
      text: '',
      color: '#fff',
      size: 14,
      createdAt: 1,
    });

    expect(parsed.success).toBe(false);
  });
});
