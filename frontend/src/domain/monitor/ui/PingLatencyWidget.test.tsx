// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import type { PingLatencyMap } from '../model/types';
import { PingLatencyWidget } from './PingLatencyWidget';

afterEach(() => {
  cleanup();
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('PingLatencyWidget', () => {
  test('renders RTT and the time the ping was received', () => {
    const receivedAt = 1_700_000_000; // unix seconds
    const pingLatencies: PingLatencyMap = {
      '7': { unit: 7, roundTripMs: 160, receivedAt },
    };

    render(
      <PingLatencyWidget
        pingLatencies={pingLatencies}
        onSendPing={() => true}
      />,
    );

    const expectedTime = new Date(receivedAt * 1000).toLocaleTimeString();
    expect(screen.getByText(/RTT 160ms/)).not.toBeNull();
    expect(
      screen.getByText(new RegExp(escapeRegExp(expectedTime))),
    ).not.toBeNull();
  });

  test('omits the received time when the timestamp is missing', () => {
    const pingLatencies: PingLatencyMap = {
      '7': { unit: 7, roundTripMs: 160, receivedAt: 0 },
    };

    render(
      <PingLatencyWidget
        pingLatencies={pingLatencies}
        onSendPing={() => true}
      />,
    );

    expect(screen.getByText(/RTT 160ms/)).not.toBeNull();
    expect(screen.queryByText(/\bat\b/)).toBeNull();
  });
});
