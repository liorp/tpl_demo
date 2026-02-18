// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MonitorMap } from './MonitorMap';

const mapEvents = {
  click: undefined as
    | ((event: { latlng: { lat: number; lng: number } }) => void)
    | undefined,
};

vi.mock('react-leaflet', () => ({
  MapContainer: ({
    center,
    zoom,
    minZoom,
    maxZoom,
    maxBounds,
    children,
  }: {
    center: [number, number];
    zoom: number;
    minZoom: number;
    maxZoom: number;
    maxBounds: [[number, number], [number, number]];
    children: React.ReactNode;
  }) => (
    <div
      data-testid="map-container"
      data-center={JSON.stringify(center)}
      data-zoom={zoom}
      data-min-zoom={minZoom}
      data-max-zoom={maxZoom}
      data-max-bounds={JSON.stringify(maxBounds)}
    >
      {children}
    </div>
  ),
  TileLayer: ({ url }: { url: string }) => (
    <div data-testid="tile-layer" data-url={url} />
  ),
  CircleMarker: () => null,
  Polyline: () => null,
  Popup: () => null,
  useMapEvents: (
    handlers: Partial<{
      click: (event: { latlng: { lat: number; lng: number } }) => void;
    }>,
  ) => {
    mapEvents.click = handlers.click;
    return {};
  },
  useMap: () => ({
    flyTo: vi.fn(),
    getZoom: () => 8,
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }),
}));

describe('MonitorMap', () => {
  beforeEach(() => {
    mapEvents.click = undefined;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  test('defaults to Mount Hermon area viewport', () => {
    render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer.getAttribute('data-center')).toBe(
      JSON.stringify([33.31, 35.78]),
    );
    expect(mapContainer.getAttribute('data-zoom')).toBe('12');
  });

  test('passes explicit map bounds to leaflet container', () => {
    const bounds: [[number, number], [number, number]] = [
      [29.1, 34.0],
      [33.7, 36.2],
    ];
    render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={bounds}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const mapContainer = screen.getAllByTestId('map-container').at(-1);
    expect(mapContainer).toBeDefined();
    expect(mapContainer?.getAttribute('data-max-bounds')).toBe(
      JSON.stringify(bounds),
    );
  });

  test('uses local tile root when provided and falls back to /tiles in offline mode', () => {
    const { rerender } = render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={'/custom-tiles'}
        offlineRequired={false}
        offlineModeEnabled={true}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(
      screen.getAllByTestId('tile-layer').at(-1)?.getAttribute('data-url'),
    ).toBe('/custom-tiles/{z}/{x}/{y}.png');

    rerender(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={true}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(
      screen.getAllByTestId('tile-layer').at(-1)?.getAttribute('data-url'),
    ).toBe('/tiles/{z}/{x}/{y}.png');
  });

  test('uses internet tiles when offline mode is disabled and offline is not required', () => {
    render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={'/custom-tiles'}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(
      screen.getAllByTestId('tile-layer').at(-1)?.getAttribute('data-url'),
    ).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(
      screen
        .getAllByTestId('map-container')
        .at(-1)
        ?.getAttribute('data-max-zoom'),
    ).toBe('19');
  });

  test('calls placement callback on map click only in placement mode', () => {
    const onPlaceAt = vi.fn();
    const { rerender } = render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={onPlaceAt}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(mapEvents.click).toBeTypeOf('function');
    mapEvents.click?.({ latlng: { lat: 33.2, lng: 35.7 } });
    expect(onPlaceAt).not.toHaveBeenCalled();

    rerender(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        placementMode={true}
        onPlaceAt={onPlaceAt}
        onSelectUnit={vi.fn()}
      />,
    );

    mapEvents.click?.({ latlng: { lat: 33.21, lng: 35.71 } });
    expect(onPlaceAt).toHaveBeenCalledWith(33.21, 35.71);
  });

  test('shows explicit offline map error when manifest is placeholder', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ format: 'placeholder' }),
      }),
    );

    render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={'/tiles'}
        offlineRequired={true}
        offlineModeEnabled={true}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('Offline map tiles are unavailable.'),
    ).not.toBeNull();
  });

  test('caps map zoom range to offline manifest levels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          format: 'xyz',
          min_zoom: 7,
          max_zoom: 12,
        }),
      }),
    );

    render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={'/tiles'}
        offlineRequired={true}
        offlineModeEnabled={true}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    await waitFor(() => {
      const mapContainer = screen.getAllByTestId('map-container').at(-1);
      expect(mapContainer?.getAttribute('data-min-zoom')).toBe('7');
      expect(mapContainer?.getAttribute('data-max-zoom')).toBe('12');
    });
  });

  test('uses conservative offline zoom defaults before manifest resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    render(
      <MonitorMap
        units={[]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={'/tiles'}
        offlineRequired={true}
        offlineModeEnabled={true}
        mapBounds={null}
        placementMode={false}
        onPlaceAt={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const mapContainer = screen.getAllByTestId('map-container').at(-1);
    expect(mapContainer?.getAttribute('data-max-zoom')).toBe('12');
    expect(mapContainer?.getAttribute('data-min-zoom')).toBe('7');
  });
});
