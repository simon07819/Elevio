"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, CheckCircle2, Eye, RotateCcw } from "lucide-react";
import { saveSiteSetting } from "@/lib/siteSettings";
import { getSiteSettings } from "@/lib/siteSettings";

type SettingRow = { key: string; value: string; label: string };

const LEGAL_SETTINGS = [
  { key: "legal_privacy_url", label: "URL Politique de confidentialité", default: "/legal/privacy" },
  { key: "legal_terms_url", label: "URL Conditions d'utilisation", default: "/legal/terms" },
  { key: "safety_notice", label: "Avis sécurité chantier", default: "" },
  { key: "liability_notice", label: "Avis limitation de responsabilité", default: "" },
  { key: "data_collection_notice", label: "Avis collecte de données", default: "" },
];

const DEFAULT_PRIVACY = JSON.stringify([
  { title: "Données collectées", color: "text-sky-400", items: ["Demandes de transport", "Étages sélectionnés", "État des opérateurs", "Données projet", "Logs techniques"] },
  { title: "Utilisation", color: "text-emerald-400", items: ["Coordination des déplacements", "Amélioration du service", "Administration chantier"], highlight: "Aucune vente de données." },
  { title: "Partage", color: "text-violet-400", items: ["Client chantier", "Services techniques"] },
  { title: "Conservation", color: "text-amber-400", text: "Les données sont conservées de façon limitée dans le temps." },
  { title: "Sécurité", color: "text-slate-400", text: "Des mesures raisonnables sont mises en place pour protéger les données." },
  { title: "Contact", color: "text-sky-400", text: "support@elevio.app" },
], null, 2);

const DEFAULT_TERMS = JSON.stringify([
  { title: "Nature du service", color: "text-emerald-400", text: "Elevio est un outil de coordination d'ascenseur de chantier. Il ne contrôle pas physiquement l'ascenseur." },
  { title: "Utilisateur", color: "text-sky-400", items: ["Utiliser l'application correctement", "Respecter les règles de chantier"] },
  { title: "Opérateur", color: "text-emerald-400", items: ["Valider uniquement les actions réelles", "Respecter les consignes de sécurité"] },
  { title: "Limitation", color: "text-amber-400", items: ["Aucune garantie de délai", "Aucune responsabilité en cas d'incident sur le chantier"] },
  { title: "Service", color: "text-violet-400", text: "Le service peut être modifié ou interrompu sans préavis." },
  { title: "Contact", color: "text-sky-400", text: "support@elevio.app" },
], null, 2);

const CONTENT_SETTINGS = [
  { key: "privacy_content", label: "Contenu politique confidentialité (JSON)", default: "" },
  { key: "terms_content", label: "Contenu conditions d'utilisation (JSON)", default: "" },
];

function parseSections(json: string): Array<{ title: string; color?: string; items?: string[]; text?: string; highlight?: string }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function SectionPreview({ sections }: { sections: ReturnType<typeof parseSections> }) {
  if (sections.length === 0) return <p className="text-xs text-slate-500 italic">Aperçu: contenu par défaut affiché</p>;
  return (
    <div className="space-y-2 mt-2">
      {sections.map((sec, i) => (
        <div key={i} className="rounded-xl bg-white/[0.03] px-3 py-2">
          <p className={`text-xs font-black uppercase ${sec.color ?? "text-slate-400"}`}>{sec.title}</p>
          {sec.items && <p className="text-xs text-slate-500 mt-0.5">• {sec.items.join(" • ")}</p>}
          {sec.text && <p className="text-xs text-slate-500 mt-0.5">{sec.text}</p>}
          {sec.highlight && <p className="text-xs font-bold text-emerald-400 mt-0.5">{sec.highlight}</p>}
        </div>
      ))}
    </div>
  );
}

export function SuperadminLegalEditor() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [contentSettings, setContentSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showPrivacyPreview, setShowPrivacyPreview] = useState(false);
  const [showTermsPreview, setShowTermsPreview] = useState(false);

  useEffect(() => {
    getSiteSettings().then((data) => {
      const rows = LEGAL_SETTINGS.map((s) => {
        const found = data.find((d) => d.key === s.key);
        return { key: s.key, value: found?.value ?? s.default, label: s.label };
      });
      setSettings(rows);

      const cRows = CONTENT_SETTINGS.map((s) => {
        const found = data.find((d) => d.key === s.key);
        return { key: s.key, value: found?.value ?? s.default, label: s.label };
      });
      setContentSettings(cRows);
    });
  }, []);

  const handleSave = useCallback(async (key: string, value: string) => {
    setLoading(key);
    setSaved(null);
    await saveSiteSetting(key, value);
    setLoading(null);
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  }, []);

  const handleReset = useCallback((key: string, defaultVal: string) => {
    if (key === "privacy_content") setContentSettings((prev) => prev.map((r) => r.key === key ? { ...r, value: DEFAULT_PRIVACY } : r));
    else if (key === "terms_content") setContentSettings((prev) => prev.map((r) => r.key === key ? { ...r, value: DEFAULT_TERMS } : r));
    else setSettings((prev) => prev.map((r) => r.key === key ? { ...r, value: defaultVal } : r));
  }, []);

  const privacySections = parseSections(contentSettings.find((s) => s.key === "privacy_content")?.value ?? "");
  const termsSections = parseSections(contentSettings.find((s) => s.key === "terms_content")?.value ?? "");

  return (
    <div className="space-y-6">
      {/* Simple settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Configuration</h3>
        {settings.map((s) => (
          <div key={s.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">{s.label}</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={s.value}
                onChange={(e) => setSettings((prev) => prev.map((r) => r.key === s.key ? { ...r, value: e.target.value } : r))}
                className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-400/50"
              />
              <button
                type="button"
                onClick={() => handleSave(s.key, s.value)}
                disabled={loading === s.key}
                className="touch-target rounded-xl bg-yellow-400/15 border border-yellow-400/25 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25 disabled:opacity-50"
              >
                {loading === s.key ? <Loader2 size={16} className="anim-spinner" /> : saved === s.key ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Save size={16} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Content editors */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Contenu des pages</h3>

        {/* Privacy content */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Politique de confidentialité (JSON)</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleReset("privacy_content", DEFAULT_PRIVACY)}
                className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition"
                title="Remettre le contenu par défaut"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setShowPrivacyPreview(!showPrivacyPreview)}
                className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition"
              >
                <Eye size={14} />
              </button>
            </div>
          </div>
          <textarea
            value={contentSettings.find((s) => s.key === "privacy_content")?.value ?? ""}
            onChange={(e) => setContentSettings((prev) => prev.map((r) => r.key === "privacy_content" ? { ...r, value: e.target.value } : r))}
            rows={8}
            className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-xs font-mono text-white outline-none focus:border-yellow-400/50 resize-y"
            placeholder={DEFAULT_PRIVACY}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => handleSave("privacy_content", contentSettings.find((s) => s.key === "privacy_content")?.value ?? "")}
              disabled={loading === "privacy_content"}
              className="touch-target rounded-xl bg-yellow-400/15 border border-yellow-400/25 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25 disabled:opacity-50"
            >
              {loading === "privacy_content" ? <Loader2 size={16} className="anim-spinner" /> : saved === "privacy_content" ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Save size={16} />}
            </button>
          </div>
          {showPrivacyPreview && <SectionPreview sections={privacySections} />}
        </div>

        {/* Terms content */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Conditions d&apos;utilisation (JSON)</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleReset("terms_content", DEFAULT_TERMS)}
                className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition"
                title="Remettre le contenu par défaut"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setShowTermsPreview(!showTermsPreview)}
                className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition"
              >
                <Eye size={14} />
              </button>
            </div>
          </div>
          <textarea
            value={contentSettings.find((s) => s.key === "terms_content")?.value ?? ""}
            onChange={(e) => setContentSettings((prev) => prev.map((r) => r.key === "terms_content" ? { ...r, value: e.target.value } : r))}
            rows={8}
            className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-xs font-mono text-white outline-none focus:border-yellow-400/50 resize-y"
            placeholder={DEFAULT_TERMS}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => handleSave("terms_content", contentSettings.find((s) => s.key === "terms_content")?.value ?? "")}
              disabled={loading === "terms_content"}
              className="touch-target rounded-xl bg-yellow-400/15 border border-yellow-400/25 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25 disabled:opacity-50"
            >
              {loading === "terms_content" ? <Loader2 size={16} className="anim-spinner" /> : saved === "terms_content" ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Save size={16} />}
            </button>
          </div>
          {showTermsPreview && <SectionPreview sections={termsSections} />}
        </div>
      </div>
    </div>
  );
}
