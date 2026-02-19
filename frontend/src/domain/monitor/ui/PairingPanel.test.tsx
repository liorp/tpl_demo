// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { PairingPanel } from './PairingPanel';

describe('PairingPanel', () => {
  afterEach(cleanup);

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

  test('clicking the row label toggles the pairing', () => {
    const onToggle = vi.fn();
    render(
      <PairingPanel
        units={[
          { id: 2, label: 'S2', lat: 33.3, lng: 35.7, status: 'active' },
          { id: 11, label: 'S11', lat: 33.31, lng: 35.72, status: 'active' },
        ]}
        pairings={[]}
        onTogglePairing={onToggle}
      />,
    );

    // Expand the panel
    fireEvent.click(screen.getByRole('button', { name: /Sensor Pairings/i }));

    // Click the label text (not the switch) — should toggle the pairing
    fireEvent.click(screen.getByText('S2'));

    expect(onToggle).toHaveBeenCalledWith(2, 11, true);
  });
});
