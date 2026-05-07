// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { SignalLinkState, UnitPlacement } from '../model/types';
import { PairingPanel } from './PairingPanel';

const TWO_UNITS: UnitPlacement[] = [
  { id: 2, label: 'S2', lat: 33.3, lng: 35.7, status: 'active' },
  { id: 11, label: 'S11', lat: 33.31, lng: 35.72, status: 'active' },
];

function defaultProps(
  overrides: {
    links?: SignalLinkState[];
    onSendPairThreshold?: ReturnType<typeof vi.fn>;
    onSendPairGain?: ReturnType<typeof vi.fn>;
    onTogglePairing?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    units: TWO_UNITS,
    pairings: [],
    links: overrides.links ?? [],
    onTogglePairing: overrides.onTogglePairing ?? vi.fn(),
    onSendPairThreshold: overrides.onSendPairThreshold ?? vi.fn(() => true),
    onSendPairGain: overrides.onSendPairGain ?? vi.fn(() => true),
  };
}

describe('PairingPanel', () => {
  afterEach(cleanup);

  test('is collapsible and toggles pairing content visibility', () => {
    render(<PairingPanel {...defaultProps()} />);

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

  test('renders a decorative heading icon next to the collapse chevron', () => {
    render(<PairingPanel {...defaultProps()} />);

    const header = screen.getByRole('button', { name: /Sensor Pairings/i });

    expect(header.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });

  test('clicking the row label toggles the pairing', () => {
    const onToggle = vi.fn();
    render(<PairingPanel {...defaultProps({ onTogglePairing: onToggle })} />);

    // Expand the panel
    fireEvent.click(screen.getByRole('button', { name: /Sensor Pairings/i }));

    // Click the label text (not the switch) — should toggle the pairing
    fireEvent.click(screen.getByText('S2'));

    expect(onToggle).toHaveBeenCalledWith(2, 11, true);
  });

  test('per-pair threshold input forwards to onSendPairThreshold', () => {
    const onSendPairThreshold = vi.fn(() => true);
    render(
      <PairingPanel
        {...defaultProps({
          onSendPairThreshold,
          links: [
            {
              side1: 2,
              side2: 11,
              threshold: 300,
              gain: 64,
              rssi: -27,
              dt: 0,
              updatedAt: 0,
            },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sensor Pairings/i }));
    // Expand the per-pair editor for S2-S11
    fireEvent.click(screen.getByRole('button', { name: /S2-S11 Threshold/i }));

    const thresholdInput = screen.getByLabelText('S2-S11 Threshold');
    fireEvent.change(thresholdInput, { target: { value: '450' } });

    const applyButtons = screen.getAllByRole('button', { name: /Apply/i });
    fireEvent.click(applyButtons[0]);

    expect(onSendPairThreshold).toHaveBeenCalledWith(2, 11, 450);
  });

  test('per-pair gain input forwards to onSendPairGain', () => {
    const onSendPairGain = vi.fn(() => true);
    render(<PairingPanel {...defaultProps({ onSendPairGain })} />);

    fireEvent.click(screen.getByRole('button', { name: /Sensor Pairings/i }));
    fireEvent.click(screen.getByRole('button', { name: /S2-S11 Threshold/i }));

    const gainInput = screen.getByLabelText('S2-S11 Gain');
    fireEvent.change(gainInput, { target: { value: '32' } });

    const applyButtons = screen.getAllByRole('button', { name: /Apply/i });
    // Second Apply button is for gain (threshold first, gain second)
    fireEvent.click(applyButtons[1]);

    expect(onSendPairGain).toHaveBeenCalledWith(2, 11, 32);
  });
});
