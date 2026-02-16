// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { PairingPanel } from './PairingPanel';

describe('PairingPanel', () => {
  test('is collapsible and toggles pairing content visibility', () => {
    render(
      <PairingPanel
        units={[
          { id: 2, label: 'S2', lat: 33.3, lng: 35.7, status: 'active' },
          { id: 11, label: 'S11', lat: 33.31, lng: 35.72, status: 'active' },
        ]}
        pairings={[]}
        onTogglePairing={vi.fn()}
      />,
    );

    const header = screen.getByRole('button', { name: /Sensor Pairings/i });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('S2')).toBeNull();

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('S2')).not.toBeNull();

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('S2')).toBeNull();
  });
});
