// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { i18n } from './config';
import { useLanguage } from './useLanguage';

afterEach(async () => {
  await i18n.changeLanguage('en');
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
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

  test('sets page direction to rtl for hebrew and ltr for english', async () => {
    const { result } = renderHook(() => useLanguage());

    await act(async () => {
      await result.current.setLanguage('he');
    });

    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');

    await act(async () => {
      await result.current.setLanguage('en');
    });

    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
