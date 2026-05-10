"use client";

import { useState, useCallback } from "react";
import { Save, Loader2, CheckCircle2, Eye, RotateCcw, Plus, Trash2 } from "lucide-react";
import { saveSiteSetting } from "@/lib/siteSettings";
import type { SiteSetting } from "@/lib/siteSettingsConfig";

const SUPPORT_SETTING_KEYS = [
  { key: "support_email", label: "Courriel support", type: "input" as const, default: "info@elevioapp.ca" },
  { key: "support_phone", label: "Téléphone support", type: "input" as const, default: "" },
  { key: "support_hours", label: "Heures de support", type: "input" as const, default: "Lun-Ven 8h-18h" },
  { key: "support_passenger_text", label: "Texte section passager", type: "textarea" as const, default: "" },
  { key: "support_operator_text", label: "Texte section opérateur", type: "textarea" as const, default: "" },
  { key: "support_safety_text", label: "Texte section sécurité", type: "textarea" as const, default: "" },
  { key: "support_data_text", label: "Texte section données", type: "textarea" as const, default: "" },
  { key: "support_liability_text", label: "Texte section responsabilité", type: "textarea" as const, default: "" },
];

const DEFAULT_PASSENGER = "Scannez le code QR affiché à votre étage, choisissez votre destination, indiquez le nombre de personnes, puis envoyez la demande. Restez près du point de ramassage jusqu'à l'arrivée de l'opérateur.";
const DEFAULT_OPERATOR = "Le terminal affiche les demandes selon le sens, la capacité et la logique du chantier. Confirmez uniquement les actions réelles (ramassage, dépôt).";
const DEFAULT_SAFETY = "Elevio ne remplace pas les règles de chantier. Respectez toujours la capacité maximale, les consignes et les procédures en vigueur.";
const DEFAULT_DATA = "Elevio collecte uniquement : demandes de transport, étages sélectionnés, état des opérateurs, données projet, logs techniques.";
const DEFAULT_LIABILITY = "Elevio est un outil de coordination. Il ne contrôle pas l'ascenseur physiquement. Aucune garantie de délai n'est fournie.";
const DEFAULT_FAQ = [
  { q: "Je ne vois pas ma demande", a: "Vérifiez que le QR code est le bon et rafraîchissez la page." },
  { q: "Mauvaise destination", a: "Annulez la demande et recréez-la avec la bonne destination." },
  { q: "Ascenseur lent", a: "Le délai dépend de la sécurité, de la capacité et des déplacements en cours." },
  { q: "Tablette réinitialisée", a: "Recréez votre demande si nécessaire." },
  { q: "Pas de confirmation", a: "Vérifiez la connexion internet du chantier." },
];

type FAQItem = { q: string; a: string };

function parseFAQ(json: string): FAQItem[] {
  if (!json || json === "[]") return [];
  try {
    const items = JSON.parse(json);
    if (!Array.isArray(items)) return [];
    return items.filter((i: unknown) => typeof (i as Record<string, unknown>).q === "string" && typeof (i as Record<string, unknown>).a === "string");
  } catch {
    return [];
  }
}

const FALLBACKS: Record<string, string> = {
  support_passenger_text: DEFAULT_PASSENGER,
  support_operator_text: DEFAULT_OPERATOR,
  support_safety_text: DEFAULT_SAFETY,
  support_data_text: DEFAULT_DATA,
  support_liability_text: DEFAULT_LIABILITY,
};

export function SuperadminSupportEditor({ settings }: { settings: SiteSetting[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );
  const initialFaq = (() => {
    const faqJson = Object.fromEntries(settings.map((s) => [s.key, s.value]))["support_faq_json"]
      || Object.fromEntries(settings.map((s) => [s.key, s.value]))["faq_content"]
      || "[]";
    const parsed = parseFAQ(faqJson);
    return parsed.length > 0 ? parsed : DEFAULT_FAQ;
  })();
  const [faqItems, setFaqItems] = useState<FAQItem[]>(initialFaq);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [showPreview, setShowPreview] = useState(false);

  const handleSave = useCallback(async (key: string, value?: string) => {
    const val = value ?? values[key] ?? "";
    setSaving((prev) => ({ ...prev, [key]: true }));
    setSaved((prev) => ({ ...prev, [key]: false }));
    await saveSiteSetting(key, val);
    setSaving((prev) => ({ ...prev, [key]: false }));
    setSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2000);
  }, [values]);

  const handleSaveFAQ = useCallback(async () => {
    const json = JSON.stringify(faqItems);
    setValues((prev) => ({ ...prev, support_faq_json: json }));
    await handleSave("support_faq_json", json);
  }, [faqItems, handleSave]);

  const addFaqItem = () => setFaqItems((prev) => [...prev, { q: "", a: "" }]);
  const removeFaqItem = (idx: number) => setFaqItems((prev) => prev.filter((_, i) => i !== idx));
  const updateFaqItem = (idx: number, field: "q" | "a", val: string) =>
    setFaqItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: val } : item)));

  const handleReset = (key: string) => {
    const fallback = FALLBACKS[key];
    if (fallback) setValues((prev) => ({ ...prev, [key]: fallback }));
  };

  return (
    <div className="space-y-6">
      {/* Text settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Textes et configuration</h3>
        {SUPPORT_SETTING_KEYS.map((s) => (
          <div key={s.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-400">{s.label}</label>
              {FALLBACKS[s.key] && (
                <button
                  type="button"
                  onClick={() => handleReset(s.key)}
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition"
                  title="Remettre le texte par défaut"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
            {s.type === "textarea" ? (
              <textarea
                rows={4}
                value={values[s.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50 resize-y"
                placeholder={FALLBACKS[s.key] ?? ""}
              />
            ) : (
              <input
                type="text"
                value={values[s.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50"
              />
            )}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => handleSave(s.key)}
                disabled={saving[s.key]}
                className="touch-target rounded-xl bg-yellow-400/15 border border-yellow-400/25 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25 disabled:opacity-50"
              >
                {saving[s.key] ? <Loader2 size={16} className="anim-spinner" /> : saved[s.key] ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Save size={16} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">FAQ</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFaqItems(DEFAULT_FAQ)}
              className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition"
              title="Remettre les FAQ par défaut"
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition"
            >
              <Eye size={14} />
            </button>
          </div>
        </div>

        {faqItems.map((item, idx) => (
          <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={item.q}
                  onChange={(e) => updateFaqItem(idx, "q", e.target.value)}
                  placeholder="Question"
                  className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-400/50"
                />
                <textarea
                  rows={2}
                  value={item.a}
                  onChange={(e) => updateFaqItem(idx, "a", e.target.value)}
                  placeholder="Réponse"
                  className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50 resize-y"
                />
              </div>
              <button
                type="button"
                onClick={() => removeFaqItem(idx)}
                className="mt-1 rounded-lg bg-rose-400/15 border border-rose-400/25 p-2 text-rose-400 hover:bg-rose-400/25 transition"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addFaqItem}
          className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition"
        >
          <Plus size={16} />
          Ajouter une question
        </button>

        <button
          type="button"
          onClick={handleSaveFAQ}
          disabled={saving["support_faq_json"]}
          className="touch-target rounded-xl bg-yellow-400/15 border border-yellow-400/25 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25 disabled:opacity-50"
        >
          {saving["support_faq_json"] ? <Loader2 size={16} className="anim-spinner" /> : saved["support_faq_json"] ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Save size={16} />}
          <span className="ml-2">Sauvegarder FAQ</span>
        </button>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Aperçu</h3>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 space-y-4">
            {values["support_passenger_text"] && (
              <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-400 mb-1">Passager</p>
                <p className="text-sm text-slate-300">{values["support_passenger_text"] || DEFAULT_PASSENGER}</p>
              </div>
            )}
            {values["support_operator_text"] && (
              <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Opérateur</p>
                <p className="text-sm text-slate-300">{values["support_operator_text"] || DEFAULT_OPERATOR}</p>
              </div>
            )}
            <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-400 mb-2">FAQ</p>
              {faqItems.filter((f) => f.q).map((f, i) => (
                <div key={i} className="mb-2">
                  <p className="text-sm font-bold text-white">{f.q}</p>
                  <p className="text-sm text-slate-400">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
