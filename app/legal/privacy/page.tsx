import { BrandLogo } from "@/components/BrandLogo";
import { BackButton } from "@/components/BackButton";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getSiteSettings } from "@/lib/siteSettings";
import { getServerLocale, serverT, type Locale } from "@/lib/i18nServer";

export const dynamic = "force-dynamic";

type PrivacySection = { title: string; color: string; items?: string[]; text?: string; highlight?: string };

function defaultSections(locale: Locale): PrivacySection[] {
  const sections: Record<Locale, Array<{ title: string; color: string; items?: string[]; text?: string; highlight?: string }>> = {
    fr: [
      { title: "Données collectées", color: "text-sky-400", items: ["Demandes de transport", "Étages sélectionnés", "État des opérateurs", "Données projet", "Logs techniques"] },
      { title: "Utilisation", color: "text-emerald-400", items: ["Coordination des déplacements", "Amélioration du service", "Administration chantier"], highlight: "Aucune vente de données." },
      { title: "Partage", color: "text-violet-400", items: ["Client chantier", "Services techniques"] },
      { title: "Conservation", color: "text-amber-400", text: "Les données sont conservées de façon limitée dans le temps. Un nettoyage automatique est effectué selon la politique de rétention du projet." },
      { title: "Sécurité", color: "text-slate-400", text: "Des mesures raisonnables sont mises en place pour protéger les données contre tout accès non autorisé." },
      { title: "Contact", color: "text-sky-400", text: "support@elevio.app" },
    ],
    en: [
      { title: "Data collected", color: "text-sky-400", items: ["Transport requests", "Selected floors", "Operator status", "Project data", "Technical logs"] },
      { title: "Usage", color: "text-emerald-400", items: ["Movement coordination", "Service improvement", "Site administration"], highlight: "No data sold." },
      { title: "Sharing", color: "text-violet-400", items: ["Site client", "Technical services"] },
      { title: "Retention", color: "text-amber-400", text: "Data is retained for a limited time. Automatic cleanup is performed according to the project retention policy." },
      { title: "Security", color: "text-slate-400", text: "Reasonable measures are in place to protect data against unauthorized access." },
      { title: "Contact", color: "text-sky-400", text: "support@elevio.app" },
    ],
    es: [
      { title: "Datos recopilados", color: "text-sky-400", items: ["Solicitudes de transporte", "Pisos seleccionados", "Estado de operadores", "Datos de proyecto", "Registros técnicos"] },
      { title: "Uso", color: "text-emerald-400", items: ["Coordinación de movimientos", "Mejora del servicio", "Administración de obra"], highlight: "Ningún dato vendido." },
      { title: "Compartición", color: "text-violet-400", items: ["Cliente de obra", "Servicios técnicos"] },
      { title: "Conservación", color: "text-amber-400", text: "Los datos se conservan por tiempo limitado. Se realiza una limpieza automática según la política de retención del proyecto." },
      { title: "Seguridad", color: "text-slate-400", text: "Se implementan medidas razonables para proteger los datos contra accesos no autorizados." },
      { title: "Contacto", color: "text-sky-400", text: "support@elevio.app" },
    ],
  };
  return sections[locale] ?? sections.fr;
}

function parseSections(json: string, locale: Locale): PrivacySection[] {
  if (!json) return defaultSections(locale);
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultSections(locale);
    return parsed;
  } catch {
    return defaultSections(locale);
  }
}

export default async function PrivacyPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof serverT>[1]) => serverT(locale, key);

  const settings = await getSiteSettings();
  const suffix = locale === "fr" ? "" : `_${locale}`;
  const byKey = (key: string) => settings.find((s) => s.key === key)?.value ?? "";
  const privacyJson = byKey(`privacy_content${suffix}`) || byKey("privacy_content");
  const sections = parseSections(privacyJson, locale);

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
            <Lock size={20} className="text-sky-400" />
            <h1 className="text-3xl font-black tracking-tight">{t("support.privacyTitle")}</h1>
          </div>
        </header>

        <div className="space-y-6">
          {sections.map((sec, i) => (
            <section key={i} className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6">
              <h2 className={`text-sm font-black uppercase tracking-[0.2em] mb-3 ${sec.color || "text-slate-400"}`}>{sec.title}</h2>
              {sec.items && <ul className="space-y-1 text-sm text-slate-300">{sec.items.map((item, j) => <li key={j}>• {item}</li>)}</ul>}
              {sec.text && <p className="text-sm leading-7 text-slate-300">{sec.text}</p>}
              {sec.highlight && <p className="mt-3 text-sm font-bold text-emerald-400">{sec.highlight}</p>}
            </section>
          ))}
        </div>

        <div className="h-20" />
      </div>
    </main>
  );
}
