// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CrossingAlertBanner } from './CrossingAlertBanner';

describe('CrossingAlertBanner', () => {
  afterEach(() => {
    cleanup();
  });

  test('allows acknowledging an active crossing alert', () => {
    const onAcknowledge = vi.fn();

    render(
      <CrossingAlertBanner
        alert={{
          sensorA: 2,
          sensorB: 11,
          at: Date.now(),
          lat: 33.3,
          lng: 35.7,
          acknowledged: false,
        }}
        onFocus={vi.fn()}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  test('does not render sensor pair label when ids are missing', () => {
    render(
      <CrossingAlertBanner
        alert={
          {
            sensorA: undefined,
            sensorB: undefined,
            at: Date.now(),
            lat: null,
            lng: null,
            acknowledged: false,
          } as unknown as never
        }
        onFocus={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.queryByText(/S.*×.*S/)).toBeNull();
  });
});
