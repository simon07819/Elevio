"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { AppNavigation } from "@/components/AppNavigation";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { T, useLanguage } from "@/components/i18n/LanguageProvider";
import { version } from "@/lib/version";

export default function SupportPage() {
  const { t } = useLanguage();

  return (
    <main className="relative z-10 flex min-h-dvh flex-col bg-slate-950 px-4 pt-2 pb-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl flex-1 pb-3">
        <header className="mb-5 flex shrink-0 items-center justify-between gap-3">
          <BrandLogo size="sm" tone="light" priority />
          <div className="flex shrink-0 items-center gap-2">
            <AppNavigation compact />
            <LanguageSwitcher light />
          </div>
        </header>

        <h1 className="mb-6 text-3xl font-black"><T k="support.title" /></h1>

        <div className="grid gap-4">
          <a
            href={t("support.privacyUrl")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-2xl border border-white/12 bg-white/8 p-5 text-white transition hover:border-yellow-300/40 hover:bg-white/12"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-yellow-300"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 7-3.5C14.5 4.8 17 6 19 6a1 1 0 0 1 1 1z" /></svg>
            <div>
              <p className="text-lg font-black"><T k="support.privacy" /></p>
              <p className="mt-1 text-sm font-bold text-slate-400">{t("support.privacyUrl").replace("https://", "")}</p>
            </div>
          </a>

          <a
            href={t("support.contactUrl")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-2xl border border-white/12 bg-white/8 p-5 text-white transition hover:border-yellow-300/40 hover:bg-white/12"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-sky-300"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></svg>
            <div>
              <p className="text-lg font-black"><T k="support.contact" /></p>
              <p className="mt-1 text-sm font-bold text-slate-400">{t("support.contactUrl").replace("https://", "")}</p>
            </div>
          </a>

          <div className="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/5 p-4 text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500"><path d="M12.586 2.586a2 2 0 0 0-1.414-.586H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>
            <p className="text-sm font-bold"><T k="support.version" values={{ version }} /></p>
          </div>
        </div>
      </div>

      <footer className="mx-auto mt-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/8 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <BrandLogo size="sm" />
        <LanguageSwitcher light />
      </footer>
    </main>
  );
}
