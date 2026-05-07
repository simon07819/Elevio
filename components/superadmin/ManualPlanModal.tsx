"use client";

import { useState } from "react";
import { attributeManualPlan, cancelManualPlan } from "@/lib/superadminActions";
import { PLANS, VISIBLE_PLAN_IDS, type PlanId } from "@/lib/billing/plans";
import { Badge } from "@/components/superadmin/Badge";

type Props = {
  userId: string;
  email: string;
  name: string;
  currentPlan: string;
  activatedVia: string;
  expiresAt: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ManualPlanModal({ userId, email, name, currentPlan, activatedVia, expiresAt, onClose, onSaved }: Props) {
  const [planId, setPlanId] = useState<PlanId>(currentPlan as PlanId);
  const [durationMonths, setDurationMonths] = useState(1);
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const isManualActive = activatedVia === "manual" && (!expiresAt || new Date(expiresAt) > new Date());
  const isIapOrStripe = ["iap", "stripe", "revenuecat"].includes(activatedVia);
  const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleDateString("fr-CA") : "—";

  function sourceLabel(via: string): string {
    switch (via) {
      case "iap": return "App Store";
      case "revenuecat": return "App Store";
      case "stripe": return "Stripe";
      case "manual": return "Manuel";
      case "admin": return "Admin";
      case "activation_code": return "Code d'activation";
      default: return "Aucun";
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await attributeManualPlan({
      userId,
      planId,
      durationMonths,
      note: note || undefined,
      force: force || undefined,
    });
    setMessage({ text: result.message, ok: result.ok });
    setSaving(false);
    if (result.ok) {
      setTimeout(() => { onSaved(); }, 1200);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setMessage(null);
    const result = await cancelManualPlan(userId);
    setMessage({ text: result.message, ok: result.ok });
    setCancelling(false);
    if (result.ok) {
      setTimeout(() => { onSaved(); }, 1200);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-panel w-full max-w-lg rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-black text-white">Attribuer un forfait</h2>

        {/* Member info */}
        <div className="mb-5 space-y-1.5 rounded-xl bg-white/5 p-4">
          <p className="text-sm text-slate-300"><span className="font-bold text-white">{name}</span></p>
          <p className="text-sm text-slate-400">{email}</p>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-black uppercase text-slate-500">Statut actuel:</span>
            <Badge variant={isManualActive ? "green" : isIapOrStripe ? "yellow" : "default"}>
              {sourceLabel(activatedVia)}
            </Badge>
            <Badge variant="default">{PLANS[currentPlan as PlanId]?.label ?? currentPlan}</Badge>
            {expiresAt && (
              <span className="text-xs text-slate-500">
                {isManualActive ? "expire le" : "expiré le"} {expiresLabel}
              </span>
            )}
          </div>
          {isIapOrStripe && (
            <div className="mt-2 rounded-lg bg-yellow-400/10 border border-yellow-400/20 p-2.5 text-xs font-bold text-yellow-300">
              Ce membre a un abonnement {sourceLabel(activatedVia)} actif. L&apos;attribution manuelle ne remplacera pas cet abonnement sauf si vous cochez &quot;Forcer&quot;.
            </div>
          )}
        </div>

        {/* Feedback */}
        {message && (
          <div className={`mb-4 rounded-xl border p-3 text-sm font-bold ${message.ok ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-300" : "bg-red-400/10 border-red-400/20 text-red-300"}`}>
            {message.text}
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-400">Forfait</label>
            <select
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm font-bold text-white"
              value={planId}
              onChange={(e) => setPlanId(e.target.value as PlanId)}
            >
              {VISIBLE_PLAN_IDS.map((id) => (
                <option key={id} value={id}>{PLANS[id].label} — {PLANS[id].description}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-400">Durée (mois)</label>
            <div className="flex gap-2">
              {[1, 3, 6, 12, 24].map((m) => (
                <button
                  key={m}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ${durationMonths === m ? "bg-yellow-400/20 text-yellow-300 border border-yellow-400/30" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}`}
                  onClick={() => setDurationMonths(m)}
                >
                  {m >= 12 ? `${m / 12} an${m / 12 > 1 ? "s" : ""}` : `${m} mois`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-400">Note interne (optionnel)</label>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500"
              placeholder="Raison du deal, référence paiement, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {isIapOrStripe && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-slate-800 accent-red-500"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              <span className="text-xs font-bold text-red-400">Forcer — écraser l&apos;abonnement {sourceLabel(activatedVia)} actif</span>
            </label>
          )}

          <div className="rounded-lg bg-white/5 p-3 text-xs text-slate-400">
            Le forfait expirera le <span className="font-bold text-white">
              {new Date(new Date().getFullYear(), new Date().getMonth() + durationMonths, new Date().getDate()).toLocaleDateString("fr-CA")}
            </span>. Après expiration, le membre retournera au forfait Starter et le paywall s&apos;affichera.
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <button
            className="flex-1 rounded-xl bg-yellow-400/15 px-4 py-2.5 text-sm font-black text-yellow-300 hover:bg-yellow-400/25 disabled:opacity-50"
            disabled={saving || durationMonths < 1}
            onClick={handleSave}
          >
            {saving ? "Attribution…" : "Attribuer le forfait"}
          </button>
          <button
            className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/15"
            onClick={onClose}
          >
            Fermer
          </button>
          {isManualActive && (
            <button
              className="rounded-xl bg-red-400/15 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-400/25 disabled:opacity-50"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? "Annulation…" : "Annuler forfait"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
