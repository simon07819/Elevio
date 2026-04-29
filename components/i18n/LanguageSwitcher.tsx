"use client";

import { useLanguage } from "@/components/i18n/LanguageProvider";

export function LanguageSwitcher({ light = false }: { light?: boolean }) {
  const { locale, setLocale, t } = useLanguage();
  const baseClass = light
    ? "border-slate-200 bg-white text-slate-950"
    : "border-white/15 bg-white/10 text-slate-100";

  return (
    <div className={`no-print flex items-center gap-1 rounded-full border p-1 ${baseClass}`} aria-label={t("common.language")}>
      {(["fr", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          className={
            locale === option
              ? "rounded-full bg-yellow-300 px-3 py-1.5 text-xs font-black text-slate-950"
              : "rounded-full px-3 py-1.5 text-xs font-black opacity-80"
          }
        >
          {option === "fr" ? t("common.french") : t("common.english")}
        </button>
      ))}
    </div>
  );
}
