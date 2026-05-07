import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { applyDocumentLanguage, supportedLanguages } from './language';
import enCommon from './resources/en';
import heCommon from './resources/he';

function syncDocumentLanguage(language: string | undefined) {
  applyDocumentLanguage(language, i18n.dir.bind(i18n));
}

let initPromise: Promise<unknown> | null = null;

if (!i18n.isInitialized) {
  const isTestEnv = Boolean(import.meta.env?.VITEST);
  initPromise = i18n
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

if (typeof document !== 'undefined') {
  i18n.on('languageChanged', (language) => {
    syncDocumentLanguage(language);
  });

  if (i18n.isInitialized) {
    syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
  } else if (initPromise) {
    void initPromise
      .then(() => {
        syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
      })
      .catch(() => {
        syncDocumentLanguage('en');
      });
  }
}

export { i18n };
