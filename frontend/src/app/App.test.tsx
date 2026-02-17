// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { App } from './App';

const state = {
  connected: true,
  port: '/dev/cu.usbserial-0001',
  alarm: 'clear' as const,
  events: [],
  links: [
    { side1: 1, side2: 2, quality: 90, intensity: 70, updatedAt: 1_700_000 },
    { side1: 3, side2: 1, quality: 65, intensity: 44, updatedAt: 1_700_001 },
  ],
  crossingAlerts: [
    {
      sensorA: 1,
      sensorB: 2,
      at: 1_700_100,
      lat: 33.3,
      lng: 35.7,
      acknowledged: false,
    },
  ],
  crossingAckWindows: [],
  config: { threshold: null, val: null },
  units: [
    {
      id: 1,
      label: 'Sensor 1',
      lat: 33.3,
      lng: 35.7,
      status: 'active' as const,
    },
    {
      id: 2,
      label: 'Sensor 2',
      lat: 33.31,
      lng: 35.71,
      status: 'active' as const,
    },
    {
      id: 3,
      label: 'Sensor 3',
      lat: 33.32,
      lng: 35.72,
      status: 'active' as const,
    },
  ],
  pairings: [],
  sensorStatus: {
    '1': { active: true, lastSeen: 1_700_002, connectedPeers: [2, 3] },
    '2': { active: false, lastSeen: null, connectedPeers: [1] },
    '3': { active: true, lastSeen: 1_700_003, connectedPeers: [1] },
  },
  mapPolicy: {
    bounds: null,
    bufferKm: null,
    tileRoot: null,
    offlineRequired: false,
  },
};

const acknowledgeCrossing = vi.fn();
const requestMap = vi.fn();
const applyConfig = vi.fn();
const resetAll = vi.fn();
const placeUnit = vi.fn();
const setUnitPairing = vi.fn();
const monitorMapMock = vi.fn();

vi.mock('../domain/monitor/service/monitorSocket', () => ({
  useMonitorSocket: () => ({
    state,
    acknowledgeCrossing,
    requestMap,
    applyConfig,
    resetAll,
    placeUnit,
    setUnitPairing,
  }),
}));

vi.mock('../domain/monitor/ui/MonitorMap', () => ({
  MonitorMap: ({
    units,
    onSelectUnit,
    focusPoint,
  }: {
    units: { id: number; label: string }[];
    onSelectUnit: (unitId: number) => void;
    focusPoint: { lat: number; lng: number } | null;
  }) => (
    <div
      data-testid="monitor-map"
      data-focus-lat={focusPoint ? focusPoint.lat : ''}
      data-focus-lng={focusPoint ? focusPoint.lng : ''}
    >
      {monitorMapMock({ focusPoint })}
      {units.map((unit) => (
        <button
          key={unit.id}
          type="button"
          onClick={() => onSelectUnit(unit.id)}
        >
          Select {unit.label}
        </button>
      ))}
    </div>
  ),
}));

describe('App', () => {
  beforeEach(() => {
    cleanup();
    acknowledgeCrossing.mockClear();
    requestMap.mockClear();
    applyConfig.mockClear();
    resetAll.mockClear();
    placeUnit.mockClear();
    setUnitPairing.mockClear();
    monitorMapMock.mockClear();
  });

  test('renders refresh map as map HUD and hides live feed indicator', () => {
    render(<App />);

    expect(screen.queryByText('Place unit ID:')).toBeNull();
    expect(screen.getByRole('button', { name: 'REFRESH MAP' })).not.toBeNull();
    expect(screen.queryByText('Live Feed')).toBeNull();
  });

  test('shows command status panel for selected sensor from map click', () => {
    render(<App />);

    const map = screen.getByTestId('monitor-map');
    fireEvent.click(
      within(map).getByRole('button', { name: 'Select Sensor 1' }),
    );

    expect(screen.getByText('CMD STATUS')).not.toBeNull();
    expect(screen.getByText('Sensor #1')).not.toBeNull();
    expect(screen.getByText('active')).not.toBeNull();
    expect(screen.getByText('OUT 1 -> 2')).not.toBeNull();
    expect(screen.getByText('Q90 • I70')).not.toBeNull();
  });

  test('updates command status panel when selected sensor changes', () => {
    render(<App />);

    const map = screen.getByTestId('monitor-map');
    fireEvent.click(
      within(map).getByRole('button', { name: 'Select Sensor 1' }),
    );
    expect(screen.getByText('Sensor #1')).not.toBeNull();
    expect(screen.getByText('active')).not.toBeNull();

    fireEvent.click(
      within(map).getByRole('button', { name: 'Select Sensor 2' }),
    );
    expect(screen.getByText('Sensor #2')).not.toBeNull();
    expect(screen.getByText('inactive')).not.toBeNull();
    expect(screen.getByText('IN 1 -> 2')).not.toBeNull();
    expect(screen.queryByText('OUT 1 -> 2')).toBeNull();
  });

  test('focuses map from crossing alert and keeps acknowledge action', () => {
    render(<App />);

    const map = screen.getByTestId('monitor-map');
    expect(map.getAttribute('data-focus-lat')).toBe('');
    expect(map.getAttribute('data-focus-lng')).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Focus S1 × S2' }));
    expect(map.getAttribute('data-focus-lat')).toBe('33.3');
    expect(map.getAttribute('data-focus-lng')).toBe('35.7');

    fireEvent.click(screen.getByRole('button', { name: 'OK S1 × S2' }));
    expect(acknowledgeCrossing).toHaveBeenCalledTimes(1);
    expect(acknowledgeCrossing).toHaveBeenCalledWith(
      expect.objectContaining({ sensorA: 1, sensorB: 2 }),
    );
  });
});
