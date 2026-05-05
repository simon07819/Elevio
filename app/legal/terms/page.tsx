import { BrandLogo } from "@/components/BrandLogo";
import { BackButton } from "@/components/BackButton";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getSiteSettings } from "@/lib/siteSettings";
import { getServerLocale, serverT, type Locale } from "@/lib/i18nServer";

export const dynamic = "force-dynamic";

type TermsSection = { title: string; color: string; items?: string[]; text?: string };

function defaultSections(locale: Locale): TermsSection[] {
  const sections: Record<Locale, Array<{ title: string; color: string; items?: string[]; text?: string }>> = {
    fr: [
      { title: "Nature du service", color: "text-emerald-400", text: "Elevio est un outil de coordination d'ascenseur de chantier. Il ne contrôle pas physiquement l'ascenseur. Il ne remplace pas l'opérateur." },
      { title: "Utilisateur", color: "text-sky-400", items: ["Utiliser l'application correctement", "Respecter les règles de chantier"] },
      { title: "Opérateur", color: "text-emerald-400", items: ["Valider uniquement les actions réelles", "Respecter les consignes de sécurité"] },
      { title: "Limitation", color: "text-amber-400", items: ["Aucune garantie de délai", "Aucune responsabilité en cas d'incident sur le chantier"] },
      { title: "Service", color: "text-violet-400", text: "Le service peut être modifié ou interrompu sans préavis." },
      { title: "Contact", color: "text-sky-400", text: "support@elevio.app" },
    ],
    en: [
      { title: "Nature of service", color: "text-emerald-400", text: "Elevio is a construction elevator coordination tool. It does not physically control the elevator. It does not replace the operator." },
      { title: "User", color: "text-sky-400", items: ["Use the application correctly", "Follow site rules"] },
      { title: "Operator", color: "text-emerald-400", items: ["Only confirm actual actions", "Follow safety instructions"] },
      { title: "Limitation", color: "text-amber-400", items: ["No time guarantee", "No liability in case of site incident"] },
      { title: "Service", color: "text-violet-400", text: "The service may be modified or interrupted without notice." },
      { title: "Contact", color: "text-sky-400", text: "support@elevio.app" },
    ],
    es: [
      { title: "Naturaleza del servicio", color: "text-emerald-400", text: "Elevio es una herramienta de coordinación de ascensor de obra. No controla físicamente el ascensor. No reemplaza al operador." },
      { title: "Usuario", color: "text-sky-400", items: ["Usar la aplicación correctamente", "Respetar las normas de obra"] },
      { title: "Operador", color: "text-emerald-400", items: ["Solo confirmar acciones reales", "Respetar las instrucciones de seguridad"] },
      { title: "Limitación", color: "text-amber-400", items: ["Sin garantía de tiempo", "Sin responsabilidad en caso de incidente en obra"] },
      { title: "Servicio", color: "text-violet-400", text: "El servicio puede ser modificado o interrumpido sin previo aviso." },
      { title: "Contacto", color: "text-sky-400", text: "support@elevio.app" },
    ],
  };
  return sections[locale] ?? sections.fr;
}

function parseSections(json: string, locale: Locale): TermsSection[] {
  if (!json) return defaultSections(locale);
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultSections(locale);
    return parsed;
  } catch {
    return defaultSections(locale);
  }
}

export default async function TermsPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof serverT>[1]) => serverT(locale, key);

  const settings = await getSiteSettings();
  const suffix = locale === "fr" ? "" : `_${locale}`;
  const byKey = (key: string) => settings.find((s) => s.key === key)?.value ?? "";
  const termsJson = byKey(`terms_content${suffix}`) || byKey("terms_content");
  const sections = parseSections(termsJson, locale);

  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <header className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <Link href="/" className="flex items-center">
              <BrandLogo size="sm" priority />
            </Link>
            <BackButton fallback="/support" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={20} className="text-emerald-400" />
            <h1 className="text-3xl font-black tracking-tight">{t("support.termsTitle")}</h1>
          </div>
        </header>

        <div className="space-y-6">
          {sections.map((sec, i) => (
            <section key={i} className={`rounded-3xl border ${sec.color === "text-amber-400" ? "border-amber-400/20 bg-amber-400/[0.06]" : "border-white/[0.08] bg-white/[0.04]"} p-6`}>
              <h2 className={`text-sm font-black uppercase tracking-[0.2em] mb-3 ${sec.color || "text-slate-400"}`}>{sec.title}</h2>
              {sec.items && <ul className="space-y-1 text-sm text-slate-300">{sec.items.map((item, j) => <li key={j}>• {item}</li>)}</ul>}
              {sec.text && <p className="text-sm leading-7 text-slate-300">{sec.text}</p>}
            </section>
          ))}
        </div>

        <div className="h-20" />
      </div>
    </main>
  );
}
