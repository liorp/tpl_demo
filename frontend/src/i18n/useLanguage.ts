import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  applyDocumentLanguage,
  normalizeLanguage,
  type SupportedLanguage,
  supportedLanguages,
} from './language';

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
