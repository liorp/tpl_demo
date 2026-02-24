// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { EventLog } from './EventLog';

describe('EventLog', () => {
  test('renders all dynamic event fields from sensor payload', () => {
    render(
      <EventLog
        events={[
          {
            time: '21:55:46',
            msg: 'MAP from 7',
            type: 'map',
            ver: 'v1',
            scan: 3,
            adv: 4,
            links: [{ side2: 12, th3: 500, rssi: -31, dt: 721 }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /System Events/i }));

    expect(screen.getByText(/type: map/i)).not.toBeNull();
    expect(screen.getByText(/ver: v1/i)).not.toBeNull();
    expect(screen.getByText(/scan: 3/i)).not.toBeNull();
    expect(screen.getByText(/adv: 4/i)).not.toBeNull();
    expect(screen.getByText(/th3/i)).not.toBeNull();
  });
});
