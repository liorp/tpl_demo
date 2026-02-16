// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { MonitorMap } from './MonitorMap';

vi.mock('react-leaflet', () => ({
  MapContainer: ({
    center,
    zoom,
    children,
  }: {
    center: [number, number];
    zoom: number;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="map-container"
      data-center={JSON.stringify(center)}
      data-zoom={zoom}
    >
      {children}
    </div>
  ),
  TileLayer: () => null,
  CircleMarker: () => null,
  Polyline: () => null,
  Popup: () => null,
  useMap: () => ({
    flyTo: vi.fn(),
    getZoom: () => 8,
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }),
}));

describe('MonitorMap', () => {
  test('defaults to Mount Hermon area viewport', () => {
    render(
      <MonitorMap units={[]} pairings={[]} links={[]} focusPoint={null} />,
    );

    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer.getAttribute('data-center')).toBe(
      JSON.stringify([33.31, 35.78]),
    );
    expect(mapContainer.getAttribute('data-zoom')).toBe('12');
  });
});
