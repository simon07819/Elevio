import { T } from "@/components/i18n/LanguageProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { APP_VERSION } from "@/lib/version";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL || "";
const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL || "";

export default function SupportPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-8 text-slate-950">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" priority />
          <h1 className="text-2xl font-black"><T k="support.title" /></h1>
        </div>

        {/* Version */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400"><T k="support.version" /></p>
          <p className="mt-1 text-lg font-black">{APP_VERSION}</p>
        </section>

        {/* Contact */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400"><T k="support.contact" /></p>
          {SUPPORT_EMAIL ? (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block text-lg font-bold text-blue-600 underline">{SUPPORT_EMAIL}</a>
          ) : (
            <p className="mt-1 text-sm font-bold text-amber-600"><T k="support.notConfigured" /></p>
          )}
        </section>

        {/* Privacy */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400"><T k="support.privacy" /></p>
          {PRIVACY_URL ? (
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="mt-1 block text-lg font-bold text-blue-600 underline"><T k="support.privacyLink" /></a>
          ) : (
            <p className="mt-1 text-sm font-bold text-amber-600"><T k="support.notConfigured" /></p>
          )}
        </section>

        {/* Terms */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400"><T k="support.terms" /></p>
          {TERMS_URL ? (
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="mt-1 block text-lg font-bold text-blue-600 underline"><T k="support.termsLink" /></a>
          ) : (
            <p className="mt-1 text-sm font-bold text-amber-600"><T k="support.notConfigured" /></p>
          )}
        </section>
      </div>
    </main>
  );
}
