"use client";

import { useState } from "react";
import { saveSiteSetting } from "@/lib/siteSettings";
import { VISIBLE_PLAN_IDS, PLANS } from "@/lib/billing/plans";

export function SuperadminSettingsPanel({ currentEmail }: { currentEmail: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(key: string, value: string) {
    setSaving(true);
    setMessage(null);
    const result = await saveSiteSetting(key, value);
    setMessage(result.message);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl bg-yellow-400/10 border border-yellow-400/20 p-3 text-sm font-bold text-yellow-300">
          {message}
        </div>
      )}

      {/* Superadmin identity */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-black text-white">Superadmin principal</h2>
        <p className="mt-2 text-sm text-slate-300">
          <span className="font-bold text-yellow-400">{currentEmail}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Le superadmin ne peut pas être changé depuis l'interface. Modifiez SUPERADMIN_EMAIL dans les variables d'environnement.
        </p>
      </section>

      {/* Visible plans */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-black text-white">Plans visibles</h2>
        <p className="mt-2 text-sm text-slate-400">
          Plans actuellement affichés : <span className="font-bold text-white">{VISIBLE_PLAN_IDS.join(", ")}</span>
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {VISIBLE_PLAN_IDS.map((id) => (
            <div key={id} className="rounded-lg border border-white/10 bg-slate-800 p-3">
              <p className="font-bold text-white">{PLANS[id].label}</p>
              <p className="text-xs text-slate-400">
                {PLANS[id].priceMonthly != null ? `${PLANS[id].priceMonthly} $/mois` : "Sur mesure"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Maintenance mode */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-black text-white">Mode maintenance</h2>
        <p className="mt-2 text-sm text-slate-400">
          Activez le mode maintenance pour afficher un message global aux utilisateurs.
        </p>
        <div className="mt-3 flex gap-3">
          <button
            className="rounded-lg bg-red-400/15 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-400/25 disabled:opacity-50"
            disabled={saving}
            onClick={() => handleSave("maintenance_message", "Maintenance en cours — revenez dans quelques minutes.")}
          >
            Activer
          </button>
          <button
            className="rounded-lg bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-400 hover:bg-emerald-400/25 disabled:opacity-50"
            disabled={saving}
            onClick={() => handleSave("maintenance_message", "")}
          >
            Désactiver
          </button>
        </div>
      </section>

      {/* Global message */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-black text-white">Message global</h2>
        <p className="mt-2 text-sm text-slate-400">
          Affiché à tous les utilisateurs dans l'app (vide = aucun message).
        </p>
        <div className="mt-3">
          <textarea
            id="global-message"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
            rows={3}
            placeholder="Message global optionnel…"
            defaultValue=""
          />
          <button
            className="mt-2 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-yellow-300 disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              const textarea = document.getElementById("global-message") as HTMLTextAreaElement;
              handleSave("global_message", textarea?.value ?? "");
            }}
          >
            Sauvegarder
          </button>
        </div>
      </section>
    </div>
  );
}
