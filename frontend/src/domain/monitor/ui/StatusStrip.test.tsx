// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { StatusStrip } from './StatusStrip';

describe('StatusStrip', () => {
  test('does not render acknowledge button in alarm state', () => {
    render(
      <StatusStrip
        state={{
          connected: true,
          port: '/dev/cu.usbserial-0001',
          alarm: 'alarm',
          events: [],
          links: [],
          crossingAlerts: [],
          config: { threshold: null, val: null },
          units: [],
          pairings: [],
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.getByText('TPL SIGNUM')).not.toBeNull();
  });
});
