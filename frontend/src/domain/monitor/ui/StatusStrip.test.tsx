// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { i18n } from '@/i18n/config';
import { StatusStrip } from './StatusStrip';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('StatusStrip', () => {
  test('does not render acknowledge button in alarm state', () => {
    render(<StatusStrip alarm="alarm" serverOnline={true} />);

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.getByText('TPL SIGNUM')).not.toBeNull();
  });

  test('renders translated status label in hebrew', async () => {
    await i18n.changeLanguage('he');
    render(<StatusStrip alarm="alarm" serverOnline={true} />);

    expect(screen.getAllByText('אזעקה').length).toBeGreaterThan(0);
  });
});
