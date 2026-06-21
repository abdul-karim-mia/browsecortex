/**
 * UI string translation (PLAN §46). English-only for v1, structured so a
 * community language is just one more JSON file + a registry entry.
 */
import en from './en.json';

const translations: Record<string, Record<string, string>> = { en };

let locale = 'en';

export function setLocale(next: string): void {
  locale = next;
}

export function getLocale(): string {
  return locale;
}

export function t(key: string, vars?: Record<string, string>): string {
  const msg = translations[locale]?.[key] ?? translations.en[key] ?? key;
  if (vars) return msg.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
  return msg;
}
