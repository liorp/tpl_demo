export const supportedLanguages = ['en', 'he'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export function normalizeLanguage(
  language: string | undefined,
): SupportedLanguage {
  return language?.startsWith('he') ? 'he' : 'en';
}

export function applyDocumentLanguage(
  language: string | undefined,
  dir: (language: string) => string,
): void {
  if (typeof document === 'undefined') {
    return;
  }
  const normalized = normalizeLanguage(language);
  document.documentElement.lang = normalized;
  document.documentElement.dir = dir(normalized);
}
