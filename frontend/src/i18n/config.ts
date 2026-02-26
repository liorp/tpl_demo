import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enCommon from './resources/en';
import heCommon from './resources/he';

export const supportedLanguages = ['en', 'he'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

if (!i18n.isInitialized) {
  const isTestEnv = Boolean(import.meta.env?.VITEST);
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { common: enCommon },
        he: { common: heCommon },
      },
      ns: ['common'],
      defaultNS: 'common',
      supportedLngs: [...supportedLanguages],
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: isTestEnv ? ['navigator'] : ['localStorage', 'navigator'],
        caches: isTestEnv ? [] : ['localStorage'],
      },
      returnEmptyString: false,
    });
}

export { i18n };
