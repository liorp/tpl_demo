import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('offline shell assets', () => {
  test('does not depend on remote stylesheet CDNs', () => {
    const indexHtml = readFileSync(
      new URL('../../index.html', import.meta.url),
      'utf-8',
    );

    expect(indexHtml).not.toContain('unpkg.com/leaflet');
    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');
  });
});
