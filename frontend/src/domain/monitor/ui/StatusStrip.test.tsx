// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { i18n } from '@/i18n/config';
import { StatusStrip } from './StatusStrip';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('StatusStrip', () => {
  test('renders only product name on the left and fullscreen on the right', () => {
    render(<StatusStrip alarm="alarm" serverOnline={true} />);

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    const productName = screen.getByText('TPL SIGNUM');
    expect(productName).not.toBeNull();
    expect(productName.parentElement?.className).toContain('me-auto');
    expect(screen.getByRole('button', { name: 'Fullscreen' })).not.toBeNull();
    expect(screen.queryByText('ALARM')).toBeNull();
    expect(screen.queryByText('ALL CLEAR')).toBeNull();
  });

  test('renders fullscreen button and toggles fullscreen mode', () => {
    const requestFullscreenMock = vi.fn();
    const exitFullscreenMock = vi.fn();

    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreenMock,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreenMock,
    });

    render(<StatusStrip alarm="clear" serverOnline={true} />);

    const toggleButton = screen.getByRole('button', { name: 'Fullscreen' });
    fireEvent.click(toggleButton);
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
    expect(exitFullscreenMock).toHaveBeenCalledTimes(0);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    });
    fireEvent.click(toggleButton);
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
  });
});
