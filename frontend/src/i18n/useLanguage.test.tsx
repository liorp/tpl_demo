// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { i18n } from './config';
import { useLanguage } from './useLanguage';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('useLanguage', () => {
  test('changes language to hebrew', async () => {
    const { result } = renderHook(() => useLanguage());

    await act(async () => {
      await result.current.setLanguage('he');
    });

    expect(result.current.language).toBe('he');
  });

  test('exposes supported languages', () => {
    const { result } = renderHook(() => useLanguage());

    expect(result.current.supportedLanguages).toEqual(['en', 'he']);
  });

  test('normalizes resolved language with region', async () => {
    await act(async () => {
      await i18n.changeLanguage('he-IL');
    });

    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('he');
  });
});
