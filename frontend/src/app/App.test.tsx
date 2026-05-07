// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { TooltipProvider } from '@/component/ui/tooltip';
import type { MonitorState } from '../domain/monitor/model/types';
import { App } from './App';

function renderApp() {
  return render(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  );
}

const state: MonitorState = {
  serverOnline: true,
  connected: true,
  port: '/dev/cu.usbserial-0001',
  alarm: 'clear',
  events: [],
  links: [
    {
      side1: 1,
      side2: 2,
      threshold: 500,
      rssi: -57,
      dt: 180,
      updatedAt: 1_700_000,
    },
    {
      side1: 3,
      side2: 1,
      threshold: 500,
      rssi: -65,
      dt: 200,
      updatedAt: 1_700_001,
    },
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
  config: { noise_threshold: null, detection_threshold: null, gain: null },
  globalSettings: { alarmSoundEnabled: true, offlineModeEnabled: true },
  units: [
    {
      id: 1,
      label: 'Sensor 1',
      lat: 33.3,
      lng: 35.7,
      status: 'active',
    },
    {
      id: 2,
      label: 'Sensor 2',
      lat: 33.31,
      lng: 35.71,
      status: 'active',
    },
    {
      id: 3,
      label: 'Sensor 3',
      lat: 33.32,
      lng: 35.72,
      status: 'active',
    },
  ],
  pairings: [],
  annotations: [],
  sensorStatus: {
    '1': { lastSeen: 1_700_002, connectedPeers: [2, 3] },
    '2': { lastSeen: null, connectedPeers: [] },
    '3': { lastSeen: 1_700_003, connectedPeers: [1] },
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
const sendThreshold = vi.fn().mockReturnValue(true);
const sendDetectionThreshold = vi.fn().mockReturnValue(true);
const sendGain = vi.fn().mockReturnValue(true);
const resetAll = vi.fn();
const setAlarmSoundEnabled = vi.fn();
const setOfflineModeEnabled = vi.fn();
const placeUnit = vi.fn();
const setUnitPairing = vi.fn();
const monitorMapMock = vi.fn();
const startAlarmSound = vi.fn();
const stopAlarmSound = vi.fn();

vi.mock('../domain/monitor/service/monitorSocket', () => ({
  useMonitorSocket: () => ({
    state,
    acknowledgeCrossing,
    requestMap,
    sendThreshold,
    sendDetectionThreshold,
    sendGain,
    setAlarmSoundEnabled,
    setOfflineModeEnabled,
    resetAll,
    placeUnit,
    setUnitPairing,
    addAnnotation: vi.fn(),
    updateAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    clearAnnotations: vi.fn(),
  }),
}));

vi.mock('../domain/monitor/ui/MonitorMap', () => ({
  MonitorMap: ({
    units,
    links,
    onSelectUnit,
    onMoveUnit,
    focusPoint,
  }: {
    units: { id: number; label: string; status?: string }[];
    links: Array<{
      side1: number;
      side2: number;
      threshold: number;
      rssi: number;
      dt: number;
      updatedAt: number;
    }>;
    onSelectUnit: (unitId: number) => void;
    onMoveUnit: (unitId: number, lat: number, lng: number) => void;
    focusPoint: { lat: number; lng: number } | null;
  }) => (
    <div
      data-testid="monitor-map"
      data-focus-lat={focusPoint ? focusPoint.lat : ''}
      data-focus-lng={focusPoint ? focusPoint.lng : ''}
    >
      {monitorMapMock({ focusPoint, units, links })}
      {units.map((unit) => (
        <div key={unit.id}>
          <button type="button" onClick={() => onSelectUnit(unit.id)}>
            Select {unit.label}
          </button>
          <button
            type="button"
            onClick={() => onMoveUnit(unit.id, 33.25, 35.75)}
          >
            Move {unit.label}
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../domain/monitor/service/alarmSound', () => ({
  startAlarmSound: () => startAlarmSound(),
  stopAlarmSound: () => stopAlarmSound(),
}));

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    cleanup();
    acknowledgeCrossing.mockClear();
    requestMap.mockClear();
    sendThreshold.mockClear();
    sendDetectionThreshold.mockClear();
    sendGain.mockClear();
    resetAll.mockClear();
    setAlarmSoundEnabled.mockClear();
    setOfflineModeEnabled.mockClear();
    placeUnit.mockClear();
    setUnitPairing.mockClear();
    monitorMapMock.mockClear();
    startAlarmSound.mockClear();
    stopAlarmSound.mockClear();
    state.globalSettings = {
      alarmSoundEnabled: true,
      offlineModeEnabled: true,
    };
    state.alarm = 'clear';
    const nowSec = Math.floor(Date.now() / 1000);
    state.units = [
      {
        id: 1,
        label: 'Sensor 1',
        lat: 33.3,
        lng: 35.7,
        status: 'active',
        lastSeenAt: nowSec,
      },
      {
        id: 2,
        label: 'Sensor 2',
        lat: 33.31,
        lng: 35.71,
        status: 'active',
        lastSeenAt: nowSec,
      },
      {
        id: 3,
        label: 'Sensor 3',
        lat: 33.32,
        lng: 35.72,
        status: 'active',
        lastSeenAt: nowSec,
      },
    ];
  });

  test('renders refresh map as map HUD and hides live feed indicator', () => {
    renderApp();

    expect(screen.queryByText('Place unit ID:')).toBeNull();
    expect(screen.queryByText('UNIT')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Place Unit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'REFRESH MAP' })).not.toBeNull();
    expect(screen.queryByText('Live Feed')).toBeNull();
  });

  test('moves a unit when map drag callback is triggered', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Move Sensor 1' }));
    expect(placeUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        lat: 33.25,
        lng: 35.75,
      }),
    );
  });

  test('passes signal links to map for sensor tooltip cmd status', () => {
    renderApp();

    expect(monitorMapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        links: state.links,
      }),
    );
  });

  test('does not render floating cmd status panel after sensor selection', () => {
    renderApp();

    const map = screen.getByTestId('monitor-map');
    fireEvent.click(
      within(map).getByRole('button', { name: 'Select Sensor 1' }),
    );

    expect(screen.queryByText('CMD STATUS')).toBeNull();
  });

  test('focuses map from crossing alert and keeps acknowledge action', () => {
    renderApp();

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

  test('starts alarm sound when crossing alerts are present and sound is enabled', () => {
    state.crossingAlerts = [];
    const { rerender } = renderApp();

    expect(startAlarmSound).toHaveBeenCalledTimes(0);

    state.crossingAlerts = [
      {
        sensorA: 1,
        sensorB: 2,
        at: 1_700_100,
        lat: 33.3,
        lng: 35.7,
        acknowledged: false,
      },
    ];
    rerender(
      <TooltipProvider>
        <App />
      </TooltipProvider>,
    );

    expect(startAlarmSound).toHaveBeenCalledTimes(1);
  });

  test('stops alarm sound when all alerts are acknowledged', () => {
    state.crossingAlerts = [
      {
        sensorA: 1,
        sensorB: 2,
        at: 1_700_100,
        lat: 33.3,
        lng: 35.7,
        acknowledged: false,
      },
    ];
    const { rerender } = renderApp();

    expect(startAlarmSound).toHaveBeenCalledTimes(1);

    state.crossingAlerts = [];
    rerender(
      <TooltipProvider>
        <App />
      </TooltipProvider>,
    );

    expect(stopAlarmSound).toHaveBeenCalled();
  });

  test('does not start alarm sound when global setting is disabled', () => {
    state.globalSettings = {
      alarmSoundEnabled: false,
      offlineModeEnabled: true,
    };
    state.crossingAlerts = [
      {
        sensorA: 1,
        sensorB: 2,
        at: 1_700_100,
        lat: 33.3,
        lng: 35.7,
        acknowledged: false,
      },
    ];

    renderApp();

    expect(startAlarmSound).toHaveBeenCalledTimes(0);
  });

  test('shows sensors with lastSeenAt regardless of active flag and marks stale by timestamp', () => {
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    const nowSec = Math.floor(nowMs / 1000);
    state.units = [
      {
        id: 1,
        label: 'Sensor 1',
        lat: 33.3,
        lng: 35.7,
        status: 'active',
        lastSeenAt: nowSec - 30,
      },
      {
        id: 2,
        label: 'Sensor 2',
        lat: 33.31,
        lng: 35.71,
        status: 'active',
        lastSeenAt: nowSec - 61,
      },
      {
        id: 3,
        label: 'Sensor 3',
        lat: 33.32,
        lng: 35.72,
        status: 'active',
      },
      {
        id: 4,
        label: 'Sensor 4',
        lat: 33.33,
        lng: 35.73,
        status: 'inactive',
        lastSeenAt: nowSec - 5,
      },
    ];

    renderApp();

    expect(
      screen.getByRole('button', { name: 'Select Sensor 1' }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Select Sensor 2' }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Select Sensor 3' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Select Sensor 4' }),
    ).not.toBeNull();
    expect(monitorMapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        units: expect.arrayContaining([
          expect.objectContaining({ id: 2, status: 'stale' }),
          expect.objectContaining({ id: 4, status: 'inactive' }),
        ]),
      }),
    );
  });
});
