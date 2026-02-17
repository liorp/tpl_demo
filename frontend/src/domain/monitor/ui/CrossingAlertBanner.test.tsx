// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CrossingAlertBanner } from './CrossingAlertBanner';

describe('CrossingAlertBanner', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders stacked permanent crossing bars', () => {
    render(
      <CrossingAlertBanner
        alerts={[
          {
            sensorA: 2,
            sensorB: 11,
            at: Date.now(),
            lat: 33.3,
            lng: 35.7,
            acknowledged: false,
          },
          {
            sensorA: 3,
            sensorB: 8,
            at: Date.now() - 1000,
            lat: null,
            lng: null,
            acknowledged: true,
          },
        ]}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByText('S2 × S11')).not.toBeNull();
    expect(screen.getByText('S3 × S8')).not.toBeNull();
    expect(screen.getByText('33.30000, 35.70000')).not.toBeNull();
    expect(screen.queryByText('Unknown location')).toBeNull();
  });

  test('acknowledges an alert pair when ok is clicked', () => {
    const onAcknowledge = vi.fn();
    render(
      <CrossingAlertBanner
        alerts={[
          {
            sensorA: 2,
            sensorB: 11,
            at: Date.now(),
            lat: 33.3,
            lng: 35.7,
            acknowledged: false,
          },
        ]}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'OK S2 × S11' }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledWith(
      expect.objectContaining({ sensorA: 2, sensorB: 11 }),
    );
  });

  test('focuses alert location when focus is clicked', () => {
    const onFocus = vi.fn();
    render(
      <CrossingAlertBanner
        alerts={[
          {
            sensorA: 2,
            sensorB: 11,
            at: Date.now(),
            lat: 33.3,
            lng: 35.7,
            acknowledged: false,
          },
        ]}
        onAcknowledge={vi.fn()}
        onFocus={onFocus}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Focus S2 × S11' }));
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        sensorA: 2,
        sensorB: 11,
        lat: 33.3,
        lng: 35.7,
      }),
    );
  });

  test('does not render sensor pair label when ids are missing', () => {
    render(<CrossingAlertBanner alerts={[]} onAcknowledge={vi.fn()} />);

    expect(screen.queryByText(/S.*×.*S/)).toBeNull();
  });
});
