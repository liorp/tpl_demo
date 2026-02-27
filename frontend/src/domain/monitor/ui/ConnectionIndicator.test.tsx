// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { TooltipProvider } from '@/component/ui/tooltip';
import { ConnectionIndicator } from './ConnectionIndicator';

afterEach(() => {
  cleanup();
});

describe('ConnectionIndicator', () => {
  test('uses logical margin utility for alignment container', () => {
    render(
      <TooltipProvider>
        <ConnectionIndicator
          connected={true}
          serverOnline={true}
          port="/dev/ttyUSB0"
        />
      </TooltipProvider>,
    );

    const onlineLabel = screen.getByText(/online/i);
    const containerClassName =
      onlineLabel.parentElement?.parentElement?.className ?? '';
    expect(containerClassName).toContain('ms-auto');
    expect(containerClassName).not.toContain('ml-auto');
  });
});
