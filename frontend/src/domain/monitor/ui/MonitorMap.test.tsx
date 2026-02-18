// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MonitorMap } from './MonitorMap';

const mapEvents = {
  click: undefined as
    | ((event: { latlng: { lat: number; lng: number } }) => void)
    | undefined,
};
const markerEvents = new Map<
  number,
  Partial<{
    click: () => void;
    dragend: (event: {
      target: { getLatLng: () => { lat: number; lng: number } };
    }) => void;
  }>
>();

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
  TileLayer: ({
    url,
    maxZoom,
    maxNativeZoom,
  }: {
    url: string;
    maxZoom: number;
    maxNativeZoom: number;
  }) => (
    <div
      data-testid="tile-layer"
      data-url={url}
      data-max-zoom={maxZoom}
      data-max-native-zoom={maxNativeZoom}
    />
  ),
  Marker: ({
    position,
    eventHandlers,
  }: {
    position: [number, number];
    eventHandlers?: Partial<{
      click: () => void;
      dragend: (event: {
        target: { getLatLng: () => { lat: number; lng: number } };
      }) => void;
    }>;
  }) => {
    markerEvents.set(position[0], eventHandlers ?? {});
    return null;
  },
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
    markerEvents.clear();
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
        onMoveUnit={vi.fn()}
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
        onMoveUnit={vi.fn()}
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
        onMoveUnit={vi.fn()}
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
        onMoveUnit={vi.fn()}
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
        onMoveUnit={vi.fn()}
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
    expect(
      screen.getAllByTestId('tile-layer').at(-1)?.getAttribute('data-max-zoom'),
    ).toBe('19');
  });

  test('calls move callback when marker drag ends', () => {
    const onMoveUnit = vi.fn();
    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
        ]}
        pairings={[]}
        links={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        onMoveUnit={onMoveUnit}
        onSelectUnit={vi.fn()}
      />,
    );

    const handlers = markerEvents.get(33.2);
    expect(handlers?.dragend).toBeTypeOf('function');
    handlers?.dragend?.({
      target: {
        getLatLng: () => ({ lat: 33.21, lng: 35.71 }),
      },
    });
    expect(onMoveUnit).toHaveBeenCalledWith(1, 33.21, 35.71);
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
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('Offline map tiles are unavailable.'),
    ).not.toBeNull();
  });

  test('allows map zoom to global max while keeping offline native levels', async () => {
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
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    await waitFor(() => {
      const mapContainer = screen.getAllByTestId('map-container').at(-1);
      expect(mapContainer?.getAttribute('data-min-zoom')).toBe('7');
      expect(mapContainer?.getAttribute('data-max-zoom')).toBe('12');
      const tileLayer = screen.getAllByTestId('tile-layer').at(-1);
      expect(tileLayer?.getAttribute('data-max-zoom')).toBe('12');
      expect(tileLayer?.getAttribute('data-max-native-zoom')).toBe('12');
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
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const mapContainer = screen.getAllByTestId('map-container').at(-1);
    expect(mapContainer?.getAttribute('data-max-zoom')).toBe('12');
    expect(mapContainer?.getAttribute('data-min-zoom')).toBe('7');
    const tileLayer = screen.getAllByTestId('tile-layer').at(-1);
    expect(tileLayer?.getAttribute('data-max-native-zoom')).toBe('12');
  });
});
