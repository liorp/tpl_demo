// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

describe('Select', () => {
  test('uses opaque backgrounds for trigger and dropdown content', () => {
    render(
      <Select defaultOpen>
        <SelectTrigger aria-label="Language">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">English</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = document.querySelector('[data-slot="select-trigger"]');
    const content = document.querySelector('[data-slot="select-content"]');

    expect(trigger).not.toBeNull();
    expect(content).not.toBeNull();

    const triggerClassName = trigger?.className ?? '';
    const contentClassName = content?.className ?? '';

    expect(triggerClassName).toContain('bg-card');
    expect(contentClassName).toContain('bg-card');
  });
});
