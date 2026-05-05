/**
 * Server-side i18n helper.
 *
 * Server components cannot use the LanguageProvider context.
 * This module resolves the locale from cookies (set by the client LanguageProvider)
 * and provides a t() function using the same translations and fallback chain.
 */
import { cookies } from "next/headers";
import { translations, localeFromCookies, type Locale, type TranslationKey } from "@/lib/i18n";

export type { Locale, TranslationKey };

/** Resolve locale on the server from the client-set cookie. */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return localeFromCookies(cookieStore.toString());
}

/** Server-side translate with fallback: locale → en → fr → key. */
export function serverT(locale: Locale, key: TranslationKey, values?: Record<string, string | number>): string {
  let text = translations[locale]?.[key] ?? translations.en[key] ?? translations.fr[key] ?? key;

  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }

  return text;
}
