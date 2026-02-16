// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { App } from './App';

vi.mock('../domain/monitor/service/monitorSocket', () => ({
  useMonitorSocket: () => ({
    state: {
      connected: true,
      port: '/dev/cu.usbserial-0001',
      alarm: 'clear',
      events: [],
      links: [],
      crossingAlerts: [],
      crossingAckWindows: [],
      config: { threshold: null, val: null },
      units: [],
      pairings: [],
    },
    acknowledgeCrossing: vi.fn(),
    requestMap: vi.fn(),
    applyConfig: vi.fn(),
    resetAll: vi.fn(),
    placeUnit: vi.fn(),
    setUnitPairing: vi.fn(),
  }),
}));

vi.mock('../domain/monitor/ui/MonitorMap', () => ({
  MonitorMap: () => <div data-testid="monitor-map" />,
}));

describe('App', () => {
  test('renders refresh map as map HUD and hides live feed indicator', () => {
    render(<App />);

    expect(screen.queryByText('Place unit ID:')).toBeNull();
    expect(screen.getByRole('button', { name: 'REFRESH MAP' })).not.toBeNull();
    expect(screen.queryByText('Live Feed')).toBeNull();
  });
});
