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

  test('ships offline map tiles with high native zoom levels', () => {
    const manifestRaw = readFileSync(
      new URL('../../public/tiles/manifest.json', import.meta.url),
      'utf-8',
    );
    const manifest = JSON.parse(manifestRaw) as {
      format?: unknown;
      min_zoom?: unknown;
      max_zoom?: unknown;
      tile_count?: unknown;
    };

    expect(manifest.format).toBe('xyz');
    expect(manifest.min_zoom).toBe(7);
    expect(manifest.max_zoom).toBeGreaterThanOrEqual(14);
    expect(manifest.tile_count).toBeTypeOf('number');
  });
});
