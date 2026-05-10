import { BrandLogo } from "@/components/BrandLogo";
import { APP_VERSION } from "@/lib/version";
import { getSiteSettings } from "@/lib/siteSettings";
import { getServerLocale, serverT, type Locale } from "@/lib/i18nServer";
import { SUPPORT_TYPES } from "@/app/api/support/route";
import Link from "next/link";
import {
  Mail, Shield, HelpCircle, AlertTriangle, Database,
  Scale, Phone, FileText, Lock, ChevronRight, Send,
  ArrowLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

const DEFAULT_EMAIL = "info@elevioapp.ca";

function defaultFAQ(locale: Locale) {
  const faqs: Record<Locale, Array<{ q: string; a: string }>> = {
    fr: [
      { q: "Je ne vois pas ma demande", a: "Vérifiez que le QR code est le bon et rafraîchissez la page." },
      { q: "Mauvaise destination", a: "Annulez la demande et recréez-la avec la bonne destination." },
      { q: "Ascenseur lent", a: "Le délai dépend de la sécurité, de la capacité et des déplacements en cours." },
      { q: "Tablette réinitialisée", a: "Recréez votre demande si nécessaire." },
      { q: "Pas de confirmation", a: "Vérifiez la connexion internet du chantier." },
    ],
    en: [
      { q: "I can't see my request", a: "Check that you scanned the right QR code and refresh the page." },
      { q: "Wrong destination", a: "Cancel the request and create a new one with the correct destination." },
      { q: "Slow elevator", a: "Wait time depends on safety rules, capacity and current movements." },
      { q: "Tablet reset", a: "Create your request again if needed." },
      { q: "No confirmation", a: "Check the site internet connection." },
    ],
    es: [
      { q: "No veo mi solicitud", a: "Verifique que escaneó el código QR correcto y recargue la página." },
      { q: "Destino incorrecto", a: "Cancele la solicitud y cree una nueva con el destino correcto." },
      { q: "Ascensor lento", a: "El tiempo de espera depende de la seguridad, capacidad y movimientos actuales." },
      { q: "Tableta reiniciada", a: "Cree su solicitud de nuevo si es necesario." },
      { q: "Sin confirmación", a: "Verifique la conexión a internet de la obra." },
    ],
  };
  return faqs[locale] ?? faqs.fr;
}

function defaultPassenger(locale: Locale) {
  const texts: Record<Locale, string> = {
    fr: "Scannez le code QR affiché à votre étage, choisissez votre destination, indiquez le nombre de personnes, puis envoyez la demande. Restez près du point de ramassage jusqu'à l'arrivée de l'opérateur.",
    en: "Scan the QR code displayed at your floor, choose your destination, indicate the number of people, then send the request. Stay near the pickup point until the operator arrives.",
    es: "Escanee el código QR mostrado en su piso, elija su destino, indique el número de personas, luego envíe la solicitud. Permanezca cerca del punto de recogida hasta que llegue el operador.",
  };
  return texts[locale] ?? texts.fr;
}

function defaultOperator(locale: Locale) {
  const texts: Record<Locale, string> = {
    fr: "Le terminal affiche les demandes selon le sens, la capacité et la logique du chantier. Confirmez uniquement les actions réelles (ramassage, dépôt).",
    en: "The terminal displays requests by direction, capacity and site logic. Only confirm actual actions (pickup, drop-off).",
    es: "La terminal muestra las solicitudes por dirección, capacidad y lógica de obra. Solo confirme las acciones reales (recogida, dejada).",
  };
  return texts[locale] ?? texts.fr;
}

function defaultSafety(locale: Locale) {
  const texts: Record<Locale, string> = {
    fr: "Elevio ne remplace pas les règles de chantier. Respectez toujours la capacité maximale, les consignes et les procédures en vigueur.",
    en: "Elevio does not replace site rules. Always respect maximum capacity, instructions and current procedures.",
    es: "Elevio no reemplaza las normas de obra. Respete siempre la capacidad máxima, las instrucciones y los procedimientos vigentes.",
  };
  return texts[locale] ?? texts.fr;
}

function defaultData(locale: Locale) {
  const texts: Record<Locale, string> = {
    fr: "Elevio collecte uniquement : demandes de transport, étages sélectionnés, état des opérateurs, données projet, logs techniques. Utilisation : coordination des déplacements, amélioration du service, administration chantier.",
    en: "Elevio only collects: transport requests, selected floors, operator status, project data, technical logs. Usage: movement coordination, service improvement, site administration.",
    es: "Elevio solo recopila: solicitudes de transporte, pisos seleccionados, estado de operadores, datos de proyecto, registros técnicos. Uso: coordinación de movimientos, mejora del servicio, administración de obra.",
  };
  return texts[locale] ?? texts.fr;
}

function defaultLiability(locale: Locale) {
  const texts: Record<Locale, string> = {
    fr: "Elevio est un outil de coordination. Il ne contrôle pas l'ascenseur physiquement. Aucune garantie de délai n'est fournie.",
    en: "Elevio is a coordination tool. It does not physically control the elevator. No time guarantee is provided.",
    es: "Elevio es una herramienta de coordinación. No controla físicamente el ascensor. No se proporciona garantía de tiempo.",
  };
  return texts[locale] ?? texts.fr;
}

function parseFAQ(json: string, locale: Locale): Array<{ q: string; a: string }> {
  if (!json || json === "[]") return defaultFAQ(locale);
  try {
    const items = JSON.parse(json);
    if (!Array.isArray(items) || items.length === 0) return defaultFAQ(locale);
    return items.filter((i: unknown) => typeof (i as Record<string, unknown>).q === "string" && typeof (i as Record<string, unknown>).a === "string");
  } catch {
    return defaultFAQ(locale);
  }
}

function supportMsgTypes(locale: Locale) {
  return [
    serverT(locale, "support.typeTechnical"),
    serverT(locale, "support.typeGeneral"),
    serverT(locale, "support.typePayment"),
    serverT(locale, "support.typeAccount"),
    serverT(locale, "support.typeSafety"),
    serverT(locale, "support.typeOther"),
  ];
}

export default async function SupportPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof serverT>[1], values?: Parameters<typeof serverT>[2]) => serverT(locale, key, values);

  const settings = await getSiteSettings();
  const byKey = (key: string) => settings.find((s) => s.key === key)?.value ?? "";
  const suffix = locale === "fr" ? "" : `_${locale}`;
  const byKeyLocale = (key: string, fallbackKey?: string) => byKey(`${key}${suffix}`) || byKey(key) || (fallbackKey ? byKey(`${fallbackKey}${suffix}`) || byKey(fallbackKey) : "");

  const supportEmail = byKeyLocale("support_email") || DEFAULT_EMAIL;
  const passengerText = byKeyLocale("support_passenger_text") || defaultPassenger(locale);
  const operatorText = byKeyLocale("support_operator_text") || defaultOperator(locale);
  const faqItems = parseFAQ(byKeyLocale("support_faq_json", "faq_content"), locale);
  const safetyText = byKeyLocale("support_safety_text", "safety_notice") || defaultSafety(locale);
  const dataText = byKeyLocale("support_data_text", "data_collection_notice") || defaultData(locale);
  const liabilityText = byKeyLocale("support_liability_text", "liability_notice") || defaultLiability(locale);

  const msgTypes = supportMsgTypes(locale);

  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <header className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <Link href="/" className="flex items-center">
              <BrandLogo size="sm" priority />
            </Link>
            <Link href="/" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[0.97] touch-target" aria-label="Retour">
              <ArrowLeft size={14} />
              <span>Retour</span>
            </Link>
          </div>
          <h1 className="text-3xl font-black tracking-tight">{t("support.title")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">{t("support.subtitle")}</p>
          <div className="mt-4 flex items-center gap-4 text-xs font-bold text-slate-500">
            <span>{t("support.version")} {APP_VERSION}</span>
            <span>•</span>
            <a href={`mailto:${supportEmail}`} className="text-sky-400 hover:text-sky-300">{supportEmail}</a>
          </div>
        </header>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle size={18} className="text-sky-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-sky-400">{t("support.passenger")}</h2>
            </div>
            <p className="text-sm leading-7 text-slate-300">{passengerText}</p>
          </section>

          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={18} className="text-emerald-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-400">{t("support.operator")}</h2>
            </div>
            <p className="text-sm leading-7 text-slate-300">{operatorText}</p>
          </section>

          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6">
            <div className="flex items-center gap-2 mb-4">
              <HelpCircle size={18} className="text-yellow-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-yellow-400">{t("support.faqSection")}</h2>
            </div>
            <div className="space-y-4">
              {faqItems.map((item, i) => (
                <div key={i} className="rounded-2xl bg-white/[0.04] px-4 py-3">
                  <p className="text-sm font-bold text-white">{item.q}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.06] p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-amber-400">{t("support.safetySection")}</h2>
            </div>
            <p className="text-sm leading-7 text-slate-300">{safetyText}</p>
          </section>

          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6">
            <div className="flex items-center gap-2 mb-3">
              <Database size={18} className="text-violet-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-violet-400">{t("support.dataSection")}</h2>
            </div>
            <p className="text-sm leading-7 text-slate-300">{dataText}</p>
            <p className="mt-2 text-sm font-bold text-emerald-400">{t("support.noDataSale")}</p>
          </section>

          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6">
            <div className="flex items-center gap-2 mb-3">
              <Scale size={18} className="text-rose-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-rose-400">{t("support.liabilitySection")}</h2>
            </div>
            <p className="text-sm leading-7 text-slate-300">{liabilityText}</p>
          </section>

          <section className="rounded-3xl border border-sky-400/20 bg-sky-400/[0.06] p-6">
            <div className="flex items-center gap-2 mb-3">
              <Mail size={18} className="text-sky-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-sky-400">{t("support.contactSection")}</h2>
            </div>
            <p className="text-sm text-slate-300 mb-4">{supportEmail}</p>
            <a
              href={`mailto:${supportEmail}`}
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-400/15 border border-sky-400/25 px-5 py-3 text-sm font-black text-sky-100 transition hover:bg-sky-400/25 active:scale-[0.98]"
            >
              <Phone size={16} />
              {t("support.contactButton")}
            </a>

            <div className="mt-6 border-t border-white/10 pt-6">
              <h3 className="text-sm font-black text-white mb-4 flex items-center gap-2">
                <Send size={16} className="text-sky-400" />
                {t("support.sendMessage")}
              </h3>
              <form action="/api/support" method="POST" className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">{t("support.typeLabel")}</label>
                  <select name="type" required className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50">
                    {msgTypes.map((typeLabel, i) => (
                      <option key={i} value={SUPPORT_TYPES[i]} className="bg-slate-900">{typeLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t("support.nameLabel")}</label>
                    <input name="name" required maxLength={100} className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t("support.emailLabel")}</label>
                    <input name="email" type="email" required maxLength={200} className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t("support.roleLabel")}</label>
                    <select name="role" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50">
                      <option value="passenger" className="bg-slate-900">{t("support.rolePassenger")}</option>
                      <option value="operator" className="bg-slate-900">{t("support.roleOperator")}</option>
                      <option value="admin" className="bg-slate-900">{t("support.roleAdmin")}</option>
                      <option value="autre" className="bg-slate-900">{t("support.roleOther")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t("support.projectLabel")}</label>
                    <input name="project" maxLength={200} placeholder={t("support.projectPlaceholder")} className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">{t("support.messageLabel")}</label>
                  <textarea name="message" required maxLength={2000} rows={4} className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50 resize-none" />
                </div>
                <button
                  type="submit"
                  className="touch-target flex items-center gap-2 rounded-2xl bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 active:scale-[0.98]"
                >
                  <Send size={16} />
                  {t("support.sendButton")}
                </button>
              </form>
            </div>
          </section>

          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-slate-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">{t("support.legalLinks")}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/legal/privacy"
                className="flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Lock size={16} className="text-sky-400" />
                {t("support.privacyTitle")}
                <ChevronRight size={14} className="ml-auto text-slate-600" />
              </Link>
              <Link
                href="/legal/terms"
                className="flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                <FileText size={16} className="text-emerald-400" />
                {t("support.termsTitle")}
                <ChevronRight size={14} className="ml-auto text-slate-600" />
              </Link>
            </div>
          </section>
        </div>

        <div className="h-20" />
      </div>
    </main>
  );
}
