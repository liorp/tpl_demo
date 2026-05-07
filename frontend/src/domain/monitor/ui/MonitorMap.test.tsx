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
const markerIcons = new Map<number, unknown>();
const polylineSegments: Array<{
  positions: [number, number][];
  pathOptions?: {
    color?: string;
    dashArray?: string;
    weight?: number;
    opacity?: number;
  };
}> = [];
const mapFlyTo = vi.fn();
const mapSetView = vi.fn();
const mapFitBounds = vi.fn();
const mapOn = vi.fn();
const mapOff = vi.fn();
const mapControlCorners = {
  bottomleft:
    typeof document === 'undefined' ? null : document.createElement('div'),
};
const mapDistance = vi.fn(() => 1234);
const mapContainerPointToLatLng = vi.fn(
  (point: [number, number] | { x: number; y: number }) => {
    const x = Array.isArray(point) ? point[0] : point.x;
    return { lat: 33.3, lng: 35.7 + x / 1000 };
  },
);

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
      <div
        ref={(node) => {
          mapControlCorners.bottomleft = node;
        }}
        data-testid="bottomleft-control-corner"
      />
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
  ScaleControl: ({
    position,
    imperial,
  }: {
    position?: string;
    imperial?: boolean;
  }) => (
    <div
      data-testid="scale-control"
      data-position={position}
      data-imperial={String(imperial)}
    />
  ),
  Marker: ({
    position,
    icon,
    eventHandlers,
    children,
  }: {
    position: [number, number];
    icon?: unknown;
    eventHandlers?: Partial<{
      click: () => void;
      dragend: (event: {
        target: { getLatLng: () => { lat: number; lng: number } };
      }) => void;
    }>;
    children?: React.ReactNode;
  }) => {
    markerEvents.set(position[0], eventHandlers ?? {});
    markerIcons.set(position[0], icon);
    return <div data-testid={`marker-${position[0]}`}>{children}</div>;
  },
  Polyline: ({
    positions,
    pathOptions,
  }: {
    positions: [number, number][];
    pathOptions?: {
      color?: string;
      dashArray?: string;
      weight?: number;
      opacity?: number;
    };
  }) => {
    polylineSegments.push({ positions, pathOptions });
    return null;
  },
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
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
    getSize: () => ({ y: 400 }),
    containerPointToLatLng: mapContainerPointToLatLng,
    distance: mapDistance,
    on: mapOn,
    off: mapOff,
    _controlCorners: mapControlCorners,
  }),
}));

describe('MonitorMap', () => {
  beforeEach(() => {
    mapEvents.click = undefined;
    markerEvents.clear();
    markerIcons.clear();
    polylineSegments.length = 0;
    vi.restoreAllMocks();
    mapFlyTo.mockClear();
    mapSetView.mockClear();
    mapFitBounds.mockClear();
    mapOn.mockClear();
    mapOff.mockClear();
    mapDistance.mockClear();
    mapContainerPointToLatLng.mockClear();
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

  test('shows a metric map scale control in the bottom left corner', () => {
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

    const scaleCorner = screen.getByTestId('bottomleft-control-corner');
    const scaleControl = screen.getByTestId('fixed-scale-control');
    expect(scaleCorner.contains(scaleControl)).toBe(true);
    expect(screen.getByTestId('fixed-scale-line').textContent).toMatch(/m|km/);
  });

  test('keeps the map scale control width fixed while updating the metric label', () => {
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

    const fixedScaleControl = screen.getByTestId('fixed-scale-control');
    const fixedScaleLine = screen.getByTestId('fixed-scale-line');
    expect(fixedScaleControl.className).toContain('fixed-map-scale');
    expect(fixedScaleLine.style.width).toBe('96px');
    expect(fixedScaleLine.textContent).toBe('1.2 km');
    expect(mapOn).toHaveBeenCalledWith(
      'zoomend moveend resize',
      expect.any(Function),
    );
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

  test('colors pairing ellipse red for unacknowledged crossing alerts', () => {
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
        pairings={[{ side1Id: 1, side2Id: 2, enabled: true }]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const icon1 = markerIcons.get(33.2) as { options: { html: string } };
    const icon2 = markerIcons.get(33.3) as { options: { html: string } };
    const icon3 = markerIcons.get(33.4) as { options: { html: string } };
    expect(icon1.options.html).toContain('background:#06b6d4');
    expect(icon1.options.html).toContain('Sensor 1');
    expect(icon2.options.html).toContain('background:#06b6d4');
    expect(icon2.options.html).toContain('Sensor 2');
    expect(icon3.options.html).toContain('background:#06b6d4');
    expect(icon3.options.html).toContain('Sensor 3');
    expect(polylineSegments).toHaveLength(1);
    expect(polylineSegments[0]?.pathOptions?.color).toBe('#ef4444');
  });

  test('uses neutral ellipse color for acknowledged crossing alerts', () => {
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
        pairings={[{ side1Id: 1, side2Id: 2, enabled: true }]}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const icon1 = markerIcons.get(33.2) as { options: { html: string } };
    const icon2 = markerIcons.get(33.3) as { options: { html: string } };
    expect(icon1.options.html).toContain('background:#06b6d4');
    expect(icon1.options.html).toContain('Sensor 1');
    expect(icon2.options.html).toContain('background:#06b6d4');
    expect(icon2.options.html).toContain('Sensor 2');
    expect(polylineSegments).toHaveLength(1);
    expect(polylineSegments[0]?.pathOptions?.color).toBe('#67e8f9');
  });

  test('colors pairing ellipse yellow for between-threshold detections within 10 seconds', () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-02-24T12:00:10').valueOf(),
    );

    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
          { id: 2, label: 'Sensor 2', lat: 33.3, lng: 35.8, status: 'active' },
        ]}
        pairings={[{ side1Id: 1, side2Id: 2, enabled: true }]}
        crossingAlerts={[]}
        events={[
          {
            time: '12:00:05',
            msg: 'DETECTION',
            type: 'detection',
            unit_a: 1,
            unit_b: 2,
            threshold: 500,
            value: 650,
          },
        ]}
        config={{ gain: null, noise_threshold: 500, detection_threshold: 700 }}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(polylineSegments).toHaveLength(1);
    expect(polylineSegments[0]?.pathOptions?.color).toBe('#eab308');
  });

  test('returns pairing ellipse to neutral after 10 seconds', () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-02-24T12:00:20').valueOf(),
    );

    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
          { id: 2, label: 'Sensor 2', lat: 33.3, lng: 35.8, status: 'active' },
        ]}
        pairings={[{ side1Id: 1, side2Id: 2, enabled: true }]}
        crossingAlerts={[]}
        events={[
          {
            time: '12:00:05',
            msg: 'DETECTION',
            type: 'detection',
            unit_a: 1,
            unit_b: 2,
            threshold: 500,
            value: 650,
          },
        ]}
        config={{ gain: null, noise_threshold: 500, detection_threshold: 700 }}
        focusPoint={null}
        tileRoot={null}
        offlineRequired={false}
        offlineModeEnabled={false}
        mapBounds={null}
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    expect(polylineSegments).toHaveLength(1);
    expect(polylineSegments[0]?.pathOptions?.color).toBe('#67e8f9');
  });

  test('uses yellow icon for stale sensors', () => {
    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
          { id: 2, label: 'Sensor 2', lat: 33.3, lng: 35.8, status: 'stale' },
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

    const icon1 = markerIcons.get(33.2) as { options: { html: string } };
    const icon2 = markerIcons.get(33.3) as { options: { html: string } };
    expect(icon1.options.html).toContain('background:#06b6d4');
    expect(icon2.options.html).toContain('background:#eab308');
    expect(icon2.options.html).toContain('Sensor 2');
  });

  test('renders map pins at 2x radius/size', () => {
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
        onMoveUnit={vi.fn()}
        onSelectUnit={vi.fn()}
      />,
    );

    const icon1 = markerIcons.get(33.2) as { options: { html: string } };
    expect(icon1.options.html).toContain('padding:4px 16px');
    expect(icon1.options.html).toContain('font-size:14px');
  });

  test('draws an ellipse for enabled sensor pairings', () => {
    render(
      <MonitorMap
        units={[
          { id: 1, label: 'Sensor 1', lat: 33.2, lng: 35.7, status: 'active' },
          { id: 2, label: 'Sensor 2', lat: 33.3, lng: 35.8, status: 'active' },
          { id: 3, label: 'Sensor 3', lat: 33.4, lng: 35.9, status: 'active' },
        ]}
        pairings={[
          { side1Id: 1, side2Id: 2, enabled: true },
          { side1Id: 2, side2Id: 3, enabled: false },
          { side1Id: 1, side2Id: 99, enabled: true },
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

    expect(polylineSegments).toHaveLength(1);
    expect(polylineSegments[0]?.positions.length).toBeGreaterThan(10);
    expect(polylineSegments[0]?.pathOptions?.dashArray).toBeUndefined();
  });

  test('drawn pairing ellipse keeps paired units as focal points', () => {
    const side1 = { lat: 33.2, lng: 35.7 };
    const side2 = { lat: 33.28, lng: 35.86 };

    render(
      <MonitorMap
        units={[
          {
            id: 1,
            label: 'Sensor 1',
            lat: side1.lat,
            lng: side1.lng,
            status: 'active',
          },
          {
            id: 2,
            label: 'Sensor 2',
            lat: side2.lat,
            lng: side2.lng,
            status: 'active',
          },
        ]}
        pairings={[{ side1Id: 1, side2Id: 2, enabled: true }]}
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

    const ellipse = polylineSegments[0]?.positions ?? [];
    expect(ellipse.length).toBeGreaterThan(10);

    const midpointLat = (side1.lat + side2.lat) / 2;
    const midpointLng = (side1.lng + side2.lng) / 2;
    const cosLat = Math.max(Math.cos((midpointLat * Math.PI) / 180), 0.00001);

    const toLocal = (lat: number, lng: number) => ({
      x: (lng - midpointLng) * cosLat,
      y: lat - midpointLat,
    });
    const focus1 = toLocal(side1.lat, side1.lng);
    const focus2 = toLocal(side2.lat, side2.lng);
    const focalSums = ellipse.map(([lat, lng]) => {
      const point = toLocal(lat, lng);
      const d1 = Math.hypot(point.x - focus1.x, point.y - focus1.y);
      const d2 = Math.hypot(point.x - focus2.x, point.y - focus2.y);
      return d1 + d2;
    });

    const minSum = Math.min(...focalSums);
    const maxSum = Math.max(...focalSums);
    expect(maxSum - minSum).toBeLessThan(0.0005);
  });

  test('drawn pairing ellipse keeps paired units as foci in Leaflet projection space', () => {
    const side1 = { lat: 29.5, lng: 34.3 };
    const side2 = { lat: 33.7, lng: 35.8 };

    render(
      <MonitorMap
        units={[
          {
            id: 1,
            label: 'Sensor 1',
            lat: side1.lat,
            lng: side1.lng,
            status: 'active',
          },
          {
            id: 2,
            label: 'Sensor 2',
            lat: side2.lat,
            lng: side2.lng,
            status: 'active',
          },
        ]}
        pairings={[{ side1Id: 1, side2Id: 2, enabled: true }]}
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

    const ellipse = polylineSegments[0]?.positions ?? [];
    expect(ellipse.length).toBeGreaterThan(10);

    const earthRadiusMeters = 6378137;
    const toProjected = (lat: number, lng: number) => {
      const latRadians = (lat * Math.PI) / 180;
      const lngRadians = (lng * Math.PI) / 180;
      return {
        x: earthRadiusMeters * lngRadians,
        y: earthRadiusMeters * Math.log(Math.tan(Math.PI / 4 + latRadians / 2)),
      };
    };
    const focus1 = toProjected(side1.lat, side1.lng);
    const focus2 = toProjected(side2.lat, side2.lng);
    const focalSums = ellipse.map(([lat, lng]) => {
      const point = toProjected(lat, lng);
      const d1 = Math.hypot(point.x - focus1.x, point.y - focus1.y);
      const d2 = Math.hypot(point.x - focus2.x, point.y - focus2.y);
      return d1 + d2;
    });

    const minSum = Math.min(...focalSums);
    const maxSum = Math.max(...focalSums);
    expect(maxSum - minSum).toBeLessThan(1);
  });

  test('shows status header, heartbeat, and full raw details for each sensor link in popup', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_012_000 * 1000);

    render(
      <MonitorMap
        units={[
          {
            id: 1,
            label: 'Sensor 1',
            lat: 33.2,
            lng: 35.7,
            status: 'active',
            lastSeenAt: 1_700_002,
          },
        ]}
        links={[
          {
            side1: 1,
            side2: 2,
            threshold: 500,
            gain: 64,
            rssi: -57,
            dt: 180,
            updatedAt: 1_700_012_000,
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

    expect(screen.queryByText('STATUS')).toBeNull();
    expect(screen.getByText('Sensor #1')).not.toBeNull();
    expect(screen.queryByText('active')).toBeNull();
    expect(screen.queryByText('inactive')).toBeNull();
    const popupContainer =
      screen.getByText('Sensor #1').parentElement?.parentElement;
    expect(popupContainer).not.toBeNull();
    expect(popupContainer?.className).toContain('max-h-[60vh]');
    expect(popupContainer?.className).toContain('overflow-y-auto');
    expect(popupContainer?.className).toContain('p-2');
    expect(popupContainer?.className).toContain('text-start');
    const heartbeat = screen.getByText(/Last heartbeat: .*ago/);
    expect(heartbeat.className).not.toContain('mt-0.5');
    expect(screen.getByText('Sensor #1').parentElement).toBe(
      heartbeat.parentElement,
    );
    expect(
      screen.getByText('Link 1 -> 2').parentElement?.parentElement?.className,
    ).toContain('mt-1');
    expect(
      screen.getByText('Link 1 -> 2').parentElement?.parentElement?.className,
    ).toContain('space-y-1');
    expect(popupContainer?.className).toContain('w-full');
    expect(popupContainer?.className).not.toContain('w-[22rem]');
    expect(screen.getByText(/Last heartbeat: .*ago/)).not.toBeNull();
    expect(screen.getByText('Link 1 -> 2')).not.toBeNull();
    const linkCardClassName =
      screen.getByText('Link 1 -> 2').parentElement?.className ?? '';
    expect(linkCardClassName).toMatch(/(?:^|\s)p-1(?:\s|$)/);
    expect(linkCardClassName).not.toContain('p-1.5');
    expect(screen.getByText('Link 1 -> 2').className).toMatch(
      /(?:^|\s)m-1(?:\s|$)/,
    );
    expect(screen.getByText('Direction: OUT')).not.toBeNull();
    expect(screen.getByText('RSSI: -57dBm')).not.toBeNull();
    expect(screen.getByText('Threshold: 500')).not.toBeNull();
    expect(screen.getByText('DT: 180')).not.toBeNull();
    expect(screen.getByText(/^Updated at: \d{2}:\d{2}:\d{2}$/)).not.toBeNull();
    expect(
      screen
        .getByText('Direction: OUT')
        .parentElement?.className.includes(
          'm-1 grid grid-cols-[max-content_max-content] justify-start gap-x-1',
        ),
    ).toBe(true);
    expect(screen.getByText('Direction: OUT').className).toMatch(
      /(?:^|\s)m-1(?:\s|$)/,
    );
  });

  test('renders non-epoch link updated_at values as placeholder instead of raw numbers', () => {
    render(
      <MonitorMap
        units={[
          {
            id: 1,
            label: 'Sensor 1',
            lat: 33.2,
            lng: 35.7,
            status: 'active',
            lastSeenAt: 1_700_002,
          },
        ]}
        links={[
          {
            side1: 1,
            side2: 2,
            threshold: 500,
            gain: 64,
            rssi: -57,
            dt: 180,
            updatedAt: 12345,
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

    expect(screen.getByText('Updated at: --')).not.toBeNull();
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
