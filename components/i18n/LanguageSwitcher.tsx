"use client";

import { useLanguage } from "@/components/i18n/LanguageProvider";

export function LanguageSwitcher({ light = false }: { light?: boolean }) {
  const { locale, setLocale, t } = useLanguage();
  const containerClass = light
    ? "border-slate-200 bg-white text-slate-950 shadow-sm ring-1 ring-slate-900/[0.06]"
    : "border-white/15 bg-white/10 text-slate-100";

  const inactiveClass = light
    ? "rounded-full px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-100"
    : "rounded-full px-3 py-1.5 text-xs font-black text-white/90 hover:bg-white/12";

  const activeClass =
    "rounded-full bg-yellow-300 px-3 py-1.5 text-xs font-black text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]";

  return (
    <div className={`no-print flex items-center gap-0.5 rounded-full border p-1 ${containerClass}`} aria-label={t("common.language")}>
      {(["fr", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          className={locale === option ? activeClass : inactiveClass}
        >
          {option === "fr" ? t("common.french") : t("common.english")}
        </button>
      ))}
    </div>
  );
}
