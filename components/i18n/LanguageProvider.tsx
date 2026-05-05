"use client";

import { createContext, useContext, useEffect, useMemo, startTransition, useState } from "react";
import { localeFromNavigatorTag, translations, type Locale, type TranslationKey } from "@/lib/i18n";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Fallback chain: locale → en → fr → key itself */
function translate(locale: Locale, key: TranslationKey, values?: Record<string, string | number>) {
  let text = translations[locale]?.[key] ?? translations.en[key] ?? translations.fr[key] ?? key;

  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }

  return text;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  /** Same initial locale on server and first client paint to avoid hydration mismatch; sync from localStorage after mount. */
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const stored = window.localStorage.getItem("elevio-locale");
    const tabletLocale = localeFromNavigatorTag(navigator.languages?.[0] ?? navigator.language ?? "");

    if (stored === "fr" || stored === "en" || stored === "es") {
      startTransition(() => setLocaleState(stored));
      return;
    }

    startTransition(() => setLocaleState(tabletLocale));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        setLocaleState(nextLocale);
        window.localStorage.setItem("elevio-locale", nextLocale);
        document.documentElement.lang = nextLocale;
      },
      t: (key, values) => translate(locale, key, values),
    }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}

export function T({ k, values }: { k: TranslationKey; values?: Record<string, string | number> }) {
  const { t } = useLanguage();
  return <>{t(k, values)}</>;
}
