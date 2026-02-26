import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('i18n config runtime guard', () => {
  test('does not reference process.env in browser code', () => {
    const source = readFileSync(resolve(__dirname, 'config.ts'), 'utf8');
    expect(source.includes('process.env')).toBe(false);
  });

  test('uses typed import.meta.env access without local casts', () => {
    const source = readFileSync(resolve(__dirname, 'config.ts'), 'utf8');
    expect(source.includes('import.meta as')).toBe(false);
  });
});
