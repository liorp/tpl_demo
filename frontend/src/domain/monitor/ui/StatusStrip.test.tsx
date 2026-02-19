// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { StatusStrip } from './StatusStrip';

describe('StatusStrip', () => {
  test('does not render acknowledge button in alarm state', () => {
    render(<StatusStrip alarm="alarm" serverOnline={true} />);

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.getByText('TPL SIGNUM')).not.toBeNull();
  });
});
