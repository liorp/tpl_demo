// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Switch } from './switch';

describe('Switch', () => {
  test('includes RTL-aware thumb translation classes', () => {
    render(<Switch defaultChecked />);

    const thumb = document.querySelector('[data-slot="switch-thumb"]');
    expect(thumb).not.toBeNull();

    const className = thumb?.className ?? '';
    expect(className).toContain(
      'data-[state=checked]:translate-x-[calc(100%-2px)]',
    );
    expect(className).toContain(
      'rtl:data-[state=checked]:-translate-x-[calc(100%-2px)]',
    );
    expect(className).toContain('rtl:data-[state=unchecked]:translate-x-0');
  });
});
