import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SupportedLanguage } from './config';
import { supportedLanguages } from './config';

function normalizeLanguage(language: string): SupportedLanguage {
  return language.startsWith('he') ? 'he' : 'en';
}

function applyDocumentLanguage(
  language: SupportedLanguage,
  i18nDir: (language: string) => string,
) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.lang = language;
  document.documentElement.dir = i18nDir(language);
}

export function useLanguage() {
  const { i18n } = useTranslation();

  return useMemo(
    () => ({
      language: normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
      supportedLanguages,
      setLanguage: async (language: SupportedLanguage) => {
        await i18n.changeLanguage(language);
        applyDocumentLanguage(language, i18n.dir.bind(i18n));
      },
    }),
    [i18n],
  );
}
