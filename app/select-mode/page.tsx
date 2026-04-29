import { BrandLogo } from "@/components/BrandLogo";
import { T } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ModeSelector } from "@/components/ModeSelector";

export default function SelectModePage() {
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-5 pb-16">
      <header className="mb-8 flex items-center justify-between">
        <BrandLogo size="sm" priority />
        <LanguageSwitcher />
      </header>
      <section className="mb-6">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.32em] text-yellow-300"><T k="select.eyebrow" /></p>
        <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl"><T k="select.title" /></h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300"><T k="select.subtitle" /></p>
      </section>
      <ModeSelector />
    </main>
  );
}
