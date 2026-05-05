import { T } from "@/components/i18n/LanguageProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { APP_VERSION } from "@/lib/version";
import { getSiteSettings } from "@/lib/siteSettings";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const settings = await getSiteSettings();
  const byKey = (key: string) => settings.find((s) => s.key === key)?.value ?? "";
  const supportEmail = byKey("support_email") || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
  const supportPhone = byKey("support_phone") || "";
  const privacyUrl = byKey("legal_privacy_url") || process.env.NEXT_PUBLIC_PRIVACY_URL || "";
  const termsUrl = byKey("legal_terms_url") || process.env.NEXT_PUBLIC_TERMS_URL || "";
  const faqContent = byKey("faq_content") || "";
  const helpText = byKey("help_app_text") || "";

  return (
    <main className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-8 text-slate-950">
      <div className="w-full max-w-lg space-y-5">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" priority />
          <h1 className="text-2xl font-black"><T k="support.title" /></h1>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400"><T k="support.version" /></p>
          <p className="mt-1 text-lg font-black">{APP_VERSION}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black"><T k="support.howToUse" /></h2>
          <p className="mt-2 text-sm leading-6">
            {helpText || <T k="support.howToUseBody" />}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black"><T k="support.faq" /></h2>
          {faqContent ? (
            <div className="mt-2 space-y-3 text-sm leading-6">
              {(() => {
                try {
                  const items = JSON.parse(faqContent);
                  if (!Array.isArray(items)) return <p>{faqContent}</p>;
                  return items.map((item: { q: string; a: string }, i: number) => (
                    <div key={i}>
                      <p className="font-bold">{item.q}</p>
                      <p className="text-slate-600">{item.a}</p>
                    </div>
                  ));
                } catch {
                  return <p>{faqContent}</p>;
                }
              })()}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6"><T k="support.faqBody" /></p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black"><T k="support.contact" /></h2>
          {supportEmail && (
            <a href={`mailto:${supportEmail}`} className="mt-1 block text-lg font-bold text-blue-600 underline">{supportEmail}</a>
          )}
          {supportPhone && (
            <a href={`tel:${supportPhone}`} className="mt-1 block text-lg font-bold text-blue-600 underline">{supportPhone}</a>
          )}
          {!supportEmail && !supportPhone && (
            <p className="mt-1 text-sm font-bold text-amber-600"><T k="support.notConfigured" /></p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black"><T k="support.privacy" /></h2>
          {privacyUrl ? (
            <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-lg font-bold text-blue-600 underline"><T k="support.privacyLink" /></a>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6"><T k="support.privacyBody" /></p>
              <p className="mt-2 text-sm font-bold text-amber-600"><T k="support.notConfigured" /></p>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black"><T k="support.terms" /></h2>
          {termsUrl ? (
            <a href={termsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-lg font-bold text-blue-600 underline"><T k="support.termsLink" /></a>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6"><T k="support.termsBody" /></p>
              <p className="mt-2 text-sm font-bold text-amber-600"><T k="support.notConfigured" /></p>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black"><T k="support.safety" /></h2>
          <p className="mt-2 text-sm leading-6"><T k="support.safetyBody" /></p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black"><T k="support.liability" /></h2>
          <p className="mt-2 text-sm leading-6"><T k="support.liabilityBody" /></p>
        </section>
      </div>
    </main>
  );
}
