// @vitest-environment jsdom

import i18n from 'i18next';
import { describe, expect, test } from 'vitest';

import '../i18n/config';

describe('i18n bootstrap', () => {
  test('initializes i18n with common namespace resources', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.hasResourceBundle('en', 'common')).toBe(true);
    expect(i18n.hasResourceBundle('he', 'common')).toBe(true);
  });

  test('keeps document dir/lang in sync when language changes without hook helpers', async () => {
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');

    await i18n.changeLanguage('he');

    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('he');
  });
});
