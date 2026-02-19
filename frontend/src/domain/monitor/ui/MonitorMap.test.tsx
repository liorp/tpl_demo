// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { alertPinIcon, MonitorMap, unitPinIcon } from './MonitorMap';

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
const markerIcons = new Map<number, unknown>();
const mapFlyTo = vi.fn();
const mapSetView = vi.fn();
const mapFitBounds = vi.fn();

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
    maxZoom?: number;
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
    minZoom,
    maxZoom,
    maxNativeZoom,
  }: {
    url: string;
    minZoom?: number;
    maxZoom?: number;
    maxNativeZoom: number;
  }) => (
    <div
      data-testid="tile-layer"
      data-url={url}
      data-min-zoom={minZoom}
      data-max-zoom={maxZoom}
      data-max-native-zoom={maxNativeZoom}
    />
  ),
  Marker: ({
    position,
    icon,
    eventHandlers,
  }: {
    position: [number, number];
    icon?: unknown;
    eventHandlers?: Partial<{
      click: () => void;
      dragend: (event: {
        target: { getLatLng: () => { lat: number; lng: number } };
      }) => void;
    }>;
  }) => {
    markerEvents.set(position[0], eventHandlers ?? {});
    markerIcons.set(position[0], icon);
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
    flyTo: mapFlyTo,
    getZoom: () => 8,
    setView: mapSetView,
    fitBounds: mapFitBounds,
  }),
}));

describe('MonitorMap', () => {
  beforeEach(() => {
    mapEvents.click = undefined;
    markerEvents.clear();
    markerIcons.clear();
    vi.restoreAllMocks();
    mapFlyTo.mockClear();
    mapSetView.mockClear();
    mapFitBounds.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  test('defaults to Mount Hermon area viewport', () => {
    render(
      <MonitorMap
        units={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[]}
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
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={bounds}
        crossingAlerts={[]}
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
        focusPoint={null}
        tileRoot={'/custom-tiles'}
        offlineRequired={false}
        offlineModeEnabled={true}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    let tileLayers = screen.getAllByTestId('tile-layer');
    expect(tileLayers[0]?.getAttribute('data-url')).toBe(
      '/custom-tiles/{z}/{x}/{y}.png',
    );

    rerender(
      <MonitorMap
        units={[]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={true}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    tileLayers = screen.getAllByTestId('tile-layer');
    expect(tileLayers[0]?.getAttribute('data-url')).toBe(
      '/tiles/{z}/{x}/{y}.png',
    );
  });

  test('uses internet tiles when offline mode is disabled and offline is not required', () => {
    render(
      <MonitorMap
        units={[]}
        focusPoint={null}
        tileRoot={'/custom-tiles'}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[]}
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
    ).toBeNull();
    expect(
      screen.getAllByTestId('tile-layer').at(-1)?.getAttribute('data-max-zoom'),
    ).toBeNull();
    expect(
      screen
        .getAllByTestId('tile-layer')
        .at(-1)
        ?.getAttribute('data-max-native-zoom'),
    ).toBe('19');
  });

  test('respects offline toggle and uses internet tiles when disabled, even if policy is offline-required', () => {
    render(
      <MonitorMap
        units={[]}
        focusPoint={null}
        tileRoot={'/custom-tiles'}
        offlineRequired={true}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(
      screen.getAllByTestId('tile-layer').at(-1)?.getAttribute('data-url'),
    ).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  test('does not auto-shift viewport when existing unit positions change', () => {
    const { rerender } = render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
          { id: 2, label: 'Sensor 2', lat: 33.4, lng: 35.9, status: 'active' },
        ]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(mapFitBounds).toHaveBeenCalledTimes(1);

    rerender(
      <MonitorMap
        units={[
          {
            id: 1,
            label: 'Sensor 1',
            lat: 33.21,
            lng: 35.71,
            status: 'active',
          },
          {
            id: 2,
            label: 'Sensor 2',
            lat: 33.41,
            lng: 35.91,
            status: 'active',
          },
        ]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(mapFitBounds).toHaveBeenCalledTimes(1);
  });

  test('calls move callback when marker drag ends', () => {
    const onMoveUnit = vi.fn();
    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
        ]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[]}
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
        focusPoint={null}
        tileRoot={'/tiles'}
        offlineRequired={true}
        offlineModeEnabled={true}
        mapBounds={null}
        crossingAlerts={[]}
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
        focusPoint={null}
        tileRoot={'/tiles'}
        offlineRequired={true}
        offlineModeEnabled={true}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    await waitFor(() => {
      const mapContainer = screen.getAllByTestId('map-container').at(-1);
      expect(mapContainer?.getAttribute('data-min-zoom')).toBe('7');
      expect(mapContainer?.getAttribute('data-max-zoom')).toBeNull();
      const tileLayers = screen.getAllByTestId('tile-layer');
      expect(tileLayers).toHaveLength(2);
      const offlineLayer = tileLayers[0];
      expect(offlineLayer?.getAttribute('data-max-zoom')).toBe('12');
      expect(offlineLayer?.getAttribute('data-max-native-zoom')).toBe('12');
      const onlineFallbackLayer = tileLayers[1];
      expect(onlineFallbackLayer?.getAttribute('data-min-zoom')).toBe('13');
      expect(onlineFallbackLayer?.getAttribute('data-max-native-zoom')).toBe(
        '19',
      );
    });
  });

  test('adds an online fallback layer above offline native max zoom', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          format: 'xyz',
          min_zoom: 7,
          max_zoom: 14,
        }),
      }),
    );

    render(
      <MonitorMap
        units={[]}
        focusPoint={null}
        tileRoot={'/tiles'}
        offlineRequired={true}
        offlineModeEnabled={true}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    await waitFor(() => {
      const tileLayers = screen.getAllByTestId('tile-layer');
      expect(tileLayers).toHaveLength(2);
      const offlineLayer = tileLayers[0];
      expect(offlineLayer?.getAttribute('data-url')).toBe(
        '/tiles/{z}/{x}/{y}.png',
      );
      expect(offlineLayer?.getAttribute('data-max-native-zoom')).toBe('14');
      expect(offlineLayer?.getAttribute('data-max-zoom')).toBe('14');

      const onlineFallbackLayer = tileLayers[1];
      expect(onlineFallbackLayer?.getAttribute('data-url')).toBe(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      );
      expect(onlineFallbackLayer?.getAttribute('data-min-zoom')).toBe('15');
      expect(onlineFallbackLayer?.getAttribute('data-max-native-zoom')).toBe(
        '19',
      );
    });
  });

  test('uses red icon for sensors involved in unacknowledged crossing alerts', () => {
    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
          { id: 2, label: 'Sensor 2', lat: 33.3, lng: 35.8, status: 'active' },
          { id: 3, label: 'Sensor 3', lat: 33.4, lng: 35.9, status: 'active' },
        ]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[
          {
            sensorA: 1,
            sensorB: 2,
            at: 1_700_000,
            lat: 33.25,
            lng: 35.75,
            acknowledged: false,
          },
        ]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(markerIcons.get(33.2)).toBe(alertPinIcon);
    expect(markerIcons.get(33.3)).toBe(alertPinIcon);
    expect(markerIcons.get(33.4)).toBe(unitPinIcon);
  });

  test('uses default icon for sensors in acknowledged crossing alerts', () => {
    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
          { id: 2, label: 'Sensor 2', lat: 33.3, lng: 35.8, status: 'active' },
        ]}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        crossingAlerts={[
          {
            sensorA: 1,
            sensorB: 2,
            at: 1_700_000,
            lat: 33.25,
            lng: 35.75,
            acknowledged: true,
          },
        ]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(markerIcons.get(33.2)).toBe(unitPinIcon);
    expect(markerIcons.get(33.3)).toBe(unitPinIcon);
  });

  test('uses conservative offline zoom defaults before manifest resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    render(
      <MonitorMap
        units={[]}
        focusPoint={null}
        tileRoot={'/tiles'}
        offlineRequired={true}
        offlineModeEnabled={true}
        mapBounds={null}
        crossingAlerts={[]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const mapContainer = screen.getAllByTestId('map-container').at(-1);
    expect(mapContainer?.getAttribute('data-max-zoom')).toBeNull();
    expect(mapContainer?.getAttribute('data-min-zoom')).toBe('7');
    const tileLayers = screen.getAllByTestId('tile-layer');
    expect(tileLayers).toHaveLength(2);
    const offlineLayer = tileLayers[0];
    expect(offlineLayer?.getAttribute('data-max-zoom')).toBe('14');
    expect(offlineLayer?.getAttribute('data-max-native-zoom')).toBe('14');
    const onlineFallbackLayer = tileLayers[1];
    expect(onlineFallbackLayer?.getAttribute('data-min-zoom')).toBe('15');
    expect(onlineFallbackLayer?.getAttribute('data-max-native-zoom')).toBe(
      '19',
    );
  });
});
