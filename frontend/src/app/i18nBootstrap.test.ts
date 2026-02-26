import i18n from 'i18next';
import { describe, expect, test } from 'vitest';

import '../i18n/config';

describe('i18n bootstrap', () => {
  test('initializes i18n with common namespace resources', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.hasResourceBundle('en', 'common')).toBe(true);
    expect(i18n.hasResourceBundle('he', 'common')).toBe(true);
  });
});
