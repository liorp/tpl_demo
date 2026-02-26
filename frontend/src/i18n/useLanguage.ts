import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SupportedLanguage } from './config';
import { supportedLanguages } from './config';

function normalizeLanguage(language: string): SupportedLanguage {
  return language.startsWith('he') ? 'he' : 'en';
}

export function useLanguage() {
  const { i18n } = useTranslation();

  return useMemo(
    () => ({
      language: normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
      supportedLanguages,
      setLanguage: async (language: SupportedLanguage) => {
        await i18n.changeLanguage(language);
      },
    }),
    [i18n],
  );
}
