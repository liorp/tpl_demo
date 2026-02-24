// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeAll, describe, expect, test, vi } from 'vitest';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

describe('TooltipContent', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  test('uses card-style background with clear padding', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button type="button">Status</button>
          </TooltipTrigger>
          <TooltipContent>Connected to sensor</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const content = document.querySelector('[data-slot="tooltip-content"]');
    expect(content).not.toBeNull();
    const className = content?.className ?? '';
    expect(className).toContain('bg-card/95');
    expect(className).toContain('border-border-bright');
    expect(className).toContain('px-3.5');
    expect(className).toContain('py-2');
  });
});
