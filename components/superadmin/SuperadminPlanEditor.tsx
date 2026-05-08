"use client";

import { useEffect, useState } from "react";
import {
  getBillingPlans,
  updateBillingPlan,
  type BillingPlanRow,
} from "@/lib/billing/billingPlanActions";
import { Check, Pencil, Save, X } from "lucide-react";

type EditState = Record<string, boolean>;

export function SuperadminPlanEditor() {
  const [plans, setPlans] = useState<BillingPlanRow[]>([]);
  const [editing, setEditing] = useState<EditState>({});
  const [drafts, setDrafts] = useState<Record<string, Partial<BillingPlanRow>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    getBillingPlans().then(setPlans);
  }, []);

  function startEdit(id: string) {
    setEditing((prev) => ({ ...prev, [id]: true }));
    const plan = plans.find((p) => p.id === id);
    if (plan) {
      setDrafts((prev) => ({ ...prev, [id]: { ...plan } }));
    }
  }

  function cancelEdit(id: string) {
    setEditing((prev) => ({ ...prev, [id]: false }));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateDraft(id: string, field: keyof BillingPlanRow, value: string | number | boolean | null) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  async function savePlan(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    setSaving(id);
    setMessage(null);
    const result = await updateBillingPlan(id, draft);
    setMessage(result.message);

    if (result.ok) {
      setEditing((prev) => ({ ...prev, [id]: false }));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      // Refresh
      const fresh = await getBillingPlans();
      setPlans(fresh);
    }
    setSaving(null);
  }

  if (plans.length === 0) {
    return <p className="text-slate-500">Aucun plan en base de données. Exécutez le script supabase/billing-plans-table.sql.</p>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`rounded-xl border p-3 text-sm font-bold ${message.includes("mis à jour") ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : "border-red-400/20 bg-red-500/10 text-red-300"}`}>
          {message}
        </div>
      )}

      {plans.map((plan) => {
        const isEditing = editing[plan.id] ?? false;
        const draft = drafts[plan.id] ?? plan;
        const isSaving = saving === plan.id;

        return (
          <div key={plan.id} className={`rounded-xl border p-5 ${plan.active ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-black text-white">{plan.id.toUpperCase()}</h3>
                {plan.popular && <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-slate-950 uppercase">Populaire</span>}
                {!plan.active && <span className="rounded-full bg-red-400/20 px-2 py-0.5 text-[10px] font-black text-red-300 uppercase">Inactif</span>}
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => savePlan(plan.id)} disabled={!!isSaving} className="touch-target flex items-center gap-1 rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-400/25 disabled:opacity-50">
                    <Save size={14} /> {isSaving ? "…" : "Sauvegarder"}
                  </button>
                  <button type="button" onClick={() => cancelEdit(plan.id)} className="touch-target flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-white/10">
                    <X size={14} /> Annuler
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => startEdit(plan.id)} className="touch-target flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-white/10">
                  <Pencil size={14} /> Modifier
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Nom" value={draft.label ?? ""} onChange={(v) => updateDraft(plan.id, "label", v)} />
                <Field label="Description" value={draft.description ?? ""} onChange={(v) => updateDraft(plan.id, "description", v)} />
                <Field label="Prix mensuel ($)" value={draft.price_monthly ?? ""} onChange={(v) => updateDraft(plan.id, "price_monthly", v === "" ? null : Number(v))} />
                <Field label="Prix annuel ($)" value={draft.price_annual ?? ""} onChange={(v) => updateDraft(plan.id, "price_annual", v === "" ? null : Number(v))} />
                <Field label="Max projets (vide=∞)" value={draft.max_projects ?? ""} onChange={(v) => updateDraft(plan.id, "max_projects", v === "" ? null : Number(v))} />
                <Field label="Max opérateurs (vide=∞)" value={draft.max_operators ?? ""} onChange={(v) => updateDraft(plan.id, "max_operators", v === "" ? null : Number(v))} />
                <SelectField label="Analytics" value={draft.analytics ?? "simple"} options={["none", "simple", "advanced"]} onChange={(v) => updateDraft(plan.id, "analytics", v)} />
                <ToggleField label="Efficiency Score" checked={draft.efficiency_score ?? false} onChange={(v) => updateDraft(plan.id, "efficiency_score", v)} />
                <ToggleField label="Business Insights" checked={draft.business_insights ?? false} onChange={(v) => updateDraft(plan.id, "business_insights", v)} />
                <ToggleField label="Operator Performance" checked={draft.operator_performance ?? false} onChange={(v) => updateDraft(plan.id, "operator_performance", v)} />
                <ToggleField label="Multi-Operator" checked={draft.multi_operator ?? false} onChange={(v) => updateDraft(plan.id, "multi_operator", v)} />
                <ToggleField label="Support prioritaire" checked={draft.priority_support ?? false} onChange={(v) => updateDraft(plan.id, "priority_support", v)} />
                <ToggleField label="IAP disponible" checked={draft.iap_available ?? false} onChange={(v) => updateDraft(plan.id, "iap_available", v)} immutable />
                <ToggleField label="Contact ventes" checked={draft.contact_sales ?? false} onChange={(v) => updateDraft(plan.id, "contact_sales", v)} />
                <ToggleField label="Populaire" checked={draft.popular ?? false} onChange={(v) => updateDraft(plan.id, "popular", v)} />
                <ToggleField label="Actif" checked={draft.active ?? true} onChange={(v) => updateDraft(plan.id, "active", v)} />
                <Field label="Ordre d'affichage" value={String(draft.sort_order ?? 0)} onChange={(v) => updateDraft(plan.id, "sort_order", Number(v))} />
              </div>
            ) : (
              <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <Readonly label="Description" value={plan.description} />
                <Readonly label="Prix" value={plan.price_monthly != null ? `${plan.price_monthly} $/mois` : "Sur mesure"} />
                <Readonly label="Projets" value={plan.max_projects ?? "Illimité"} />
                <Readonly label="Opérateurs" value={plan.max_operators ?? "Illimité"} />
                <Readonly label="Analytics" value={plan.analytics} />
                <BoolReadonly label="Efficiency Score" checked={plan.efficiency_score} />
                <BoolReadonly label="Multi-Operator" checked={plan.multi_operator} />
                <BoolReadonly label="IAP" checked={plan.iap_available} />
                <Readonly label="RevenueCat Product ID" value={plan.id === "starter" ? "elevio_starter_monthly / _yearly" : plan.id === "pro" ? "elevio_pro_monthly / _yearly" : "—"} />
                <Readonly label="Stripe Price ID" value={plan.iap_available ? "stripe_price_" + plan.id : "—"} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string | number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ToggleField({ label, checked, onChange, immutable }: { label: string; checked: boolean; onChange: (v: boolean) => void; immutable?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-black uppercase tracking-widest text-slate-500">{label}{immutable && <span className="ml-1 text-[10px] text-amber-400">(verrouillé)</span>}</label>
      <button
        type="button"
        onClick={() => !immutable && onChange(!checked)}
        className={`rounded-full p-1 ${immutable ? "cursor-not-allowed bg-slate-600" : checked ? "bg-emerald-400" : "bg-slate-700"}`}
      >
        <Check size={14} className={checked ? (immutable ? "text-slate-400" : "text-slate-950") : "text-slate-500"} />
      </button>
    </div>
  );
}

function Readonly({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{label}: </span>
      <span className="font-bold text-white">{String(value ?? "—")}</span>
    </div>
  );
}

function BoolReadonly({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{label}: </span>
      <span className={`font-bold ${checked ? "text-emerald-400" : "text-slate-600"}`}>{checked ? "Oui" : "Non"}</span>
    </div>
  );
}
