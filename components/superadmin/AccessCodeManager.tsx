"use client";

import { useState } from "react";
import {
  createAccessCode,
  deleteAccessCode,
  toggleAccessCode,
  getAccessCodeUsage,
  type AccessCodeRow,
  type AccessCodeUsageRow,
  type AccessCodeSource,
} from "@/lib/superadminAccessCodes";
import { Badge } from "@/components/superadmin/Badge";
import {
  Plus,
  Trash2,
  Power,
  PowerOff,
  Users,
  Copy,
  Check,
  X,
} from "lucide-react";

const DURATION_LABELS: Record<string, string> = {
  permanent: "Permanent",
  "7d": "7 jours",
  "30d": "30 jours",
  "1y": "1 an",
  custom: "Personnalisée",
};

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

const SOURCE_LABELS: Record<AccessCodeSource, string> = {
  free: "Gratuit (free)",
  manual: "Manuel (admin)",
  manual_code: "Code manuel",
  revenuecat: "RevenueCat",
  app_store: "App Store",
  stripe: "Stripe",
};

const INTERVAL_LABELS: Record<string, string> = {
  monthly: "Mensuel",
  annual: "Annuel",
  permanent: "Permanent",
};

function sourceVariant(src: AccessCodeSource): "yellow" | "green" | "red" | "default" {
  if (src === "stripe") return "green";
  if (src === "revenuecat" || src === "app_store") return "yellow";
  if (src === "free") return "default";
  return "default";
}

export function AccessCodeManager({ codes }: { codes: AccessCodeRow[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [usageModal, setUsageModal] = useState<AccessCodeRow | null>(null);
  const [usageData, setUsageData] = useState<AccessCodeUsageRow[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    setLoading("create");
    setMessage(null);
    setCreatedCodes([]);
    const result = await createAccessCode(formData);
    setMessage(result.message);
    if (result.ok) {
      setCreatedCodes(result.codes ?? []);
      setShowCreate(false);
    }
    setLoading(null);
  }

  async function handleToggle(codeId: string, enabled: boolean) {
    setLoading(codeId);
    const result = await toggleAccessCode(codeId, !enabled);
    setMessage(result.message);
    setLoading(null);
  }

  async function handleDelete(codeId: string) {
    if (!confirm("Supprimer ce code ? Cette action est irréversible.")) return;
    setLoading(codeId);
    const result = await deleteAccessCode(codeId);
    setMessage(result.message);
    setLoading(null);
  }

  async function handleShowUsage(code: AccessCodeRow) {
    setUsageModal(code);
    const data = await getAccessCodeUsage(code.id);
    setUsageData(data);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  return (
    <div>
      {message && (
        <div className="mb-4 rounded-xl bg-yellow-400/10 border border-yellow-400/20 p-3 text-sm font-bold text-yellow-300">
          {message}
        </div>
      )}

      {createdCodes.length > 0 && (
        <div className="mb-4 rounded-xl bg-emerald-400/10 border border-emerald-400/20 p-3 text-sm text-emerald-200">
          <p className="font-black mb-2">Codes générés — copiez-les maintenant :</p>
          <div className="flex flex-wrap gap-2">
            {createdCodes.map((c) => (
              <button
                key={c}
                onClick={() => copyCode(c)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-2 py-1 text-xs font-black text-emerald-100 hover:bg-emerald-400/25 transition"
                title="Copier"
              >
                <code>{c}</code>
                {copiedCode === c ? <Check size={12} /> : <Copy size={12} />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black text-white">Codes achat</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="touch-target flex items-center gap-2 rounded-xl bg-sky-400/15 border border-sky-400/25 px-4 py-2 text-sm font-bold text-sky-400 hover:bg-sky-400/25 transition"
        >
          <Plus size={16} />
          Générer des codes
        </button>
      </div>

      {showCreate && (
        <form action={handleCreate} className="mb-6 rounded-3xl border border-sky-400/20 bg-sky-400/[0.06] p-6 space-y-4">
          <h3 className="text-sm font-black text-sky-400 uppercase tracking-wider">Nouveau code achat</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Nom</label>
              <input name="name" required maxLength={100} placeholder="ex: Promo printemps" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Préfixe du code</label>
              <input name="code_prefix" maxLength={10} defaultValue="ELEV" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Forfait (plan)</label>
              <select name="plan" required defaultValue="starter" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50">
                <option value="free">Gratuit</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Source / provider</label>
              <select name="source" required defaultValue="manual_code" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50">
                <option value="manual_code">Code manuel</option>
                <option value="manual">Manuel (admin)</option>
                <option value="free">Free</option>
                <option value="revenuecat">RevenueCat</option>
                <option value="app_store">App Store</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Cycle de facturation</label>
              <select name="billing_interval" required defaultValue="monthly" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50">
                <option value="monthly">Mensuel</option>
                <option value="annual">Annuel</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Durée de l&apos;activation</label>
              <select name="duration" required defaultValue="permanent" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50">
                <option value="permanent">Permanent</option>
                <option value="7d">7 jours</option>
                <option value="30d">30 jours</option>
                <option value="1y">1 an</option>
                <option value="custom">Date personnalisée</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Date personnalisée (si durée = personnalisée)</label>
              <input name="custom_expires_at" type="date" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Expiration du code (optionnel)</label>
              <input name="expires_at" type="date" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Utilisations max (vide = illimité)</label>
              <input name="max_uses" type="number" min={1} placeholder="1" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Nombre de codes à générer</label>
              <input name="count" type="number" min={1} max={50} defaultValue={1} className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Rabais % (optionnel)</label>
              <input name="discount_percent" type="number" min={0} max={100} placeholder="0" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Entreprise / client (optionnel)</label>
              <input name="company_name" maxLength={120} placeholder="ex: Acme Construction" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-400 mb-1">Description</label>
              <input name="description" maxLength={200} placeholder="Optionnel" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-400 mb-1">Notes internes</label>
              <textarea name="notes" maxLength={500} rows={2} placeholder="Visibles uniquement par les superadmins" className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading === "create"} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-sky-300 transition disabled:opacity-50">
              {loading === "create" ? "Création..." : "Générer"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/15 transition">
              Annuler
            </button>
          </div>
        </form>
      )}

      {codes.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">Aucun code achat créé.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-black uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-3">Code</th>
                <th className="pb-3 pr-3">Nom</th>
                <th className="pb-3 pr-3">Forfait</th>
                <th className="pb-3 pr-3">Source</th>
                <th className="pb-3 pr-3">Cycle</th>
                <th className="pb-3 pr-3">Durée</th>
                <th className="pb-3 pr-3">Entreprise</th>
                <th className="pb-3 pr-3">Utilisations</th>
                <th className="pb-3 pr-3">Expire</th>
                <th className="pb-3 pr-3">Statut</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {codes.map((c) => {
                const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
                const used = c.current_uses > 0;
                const exhausted =
                  c.max_uses !== null && c.max_uses > 0 && c.current_uses >= c.max_uses;
                const statusBadge = !c.enabled ? (
                  <Badge variant="red">Désactivé</Badge>
                ) : expired ? (
                  <Badge variant="red">Expiré</Badge>
                ) : exhausted ? (
                  <Badge variant="red">Épuisé</Badge>
                ) : used ? (
                  <Badge variant="yellow">Utilisé</Badge>
                ) : (
                  <Badge variant="green">Actif</Badge>
                );
                return (
                  <tr key={c.id} className={!c.enabled || expired ? "opacity-50" : ""}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1.5">
                        <code className="rounded-lg bg-white/10 px-2 py-0.5 text-xs font-bold text-white">{c.code}</code>
                        <button onClick={() => copyCode(c.code)} className="text-slate-500 hover:text-white transition" aria-label="Copier le code">
                          {copiedCode === c.code ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-slate-300">{c.name}</td>
                    <td className="py-3 pr-3">
                      <Badge variant={c.plan === "enterprise" ? "green" : c.plan === "pro" ? "yellow" : "default"}>
                        {PLAN_LABELS[c.plan] ?? c.plan}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant={sourceVariant(c.source)}>
                        {SOURCE_LABELS[c.source] ?? c.source}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3 text-slate-400">{INTERVAL_LABELS[c.billing_interval] ?? c.billing_interval}</td>
                    <td className="py-3 pr-3 text-slate-400">{DURATION_LABELS[c.duration] ?? c.duration}</td>
                    <td className="py-3 pr-3 text-slate-400">{c.company_name || "—"}</td>
                    <td className="py-3 pr-3 text-slate-400">
                      {c.current_uses}{c.max_uses ? `/${c.max_uses}` : "/∞"}
                    </td>
                    <td className="py-3 pr-3 text-slate-400">
                      {c.expires_at ? new Date(c.expires_at).toLocaleDateString("fr-CA") : "—"}
                    </td>
                    <td className="py-3 pr-3">{statusBadge}</td>
                    <td className="py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleToggle(c.id, c.enabled)}
                          disabled={loading === c.id}
                          className="rounded-lg bg-white/5 px-2 py-1 text-xs font-bold text-slate-400 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                          title={c.enabled ? "Désactiver" : "Activer"}
                        >
                          {c.enabled ? <PowerOff size={14} /> : <Power size={14} />}
                        </button>
                        <button
                          onClick={() => handleShowUsage(c)}
                          className="rounded-lg bg-white/5 px-2 py-1 text-xs font-bold text-slate-400 hover:bg-white/10 hover:text-white transition"
                          title="Utilisateurs"
                        >
                          <Users size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={loading === c.id || used}
                          className="rounded-lg bg-red-400/10 px-2 py-1 text-xs font-bold text-red-400 hover:bg-red-400/20 transition disabled:opacity-30"
                          title={used ? "Code déjà utilisé — désactiver" : "Supprimer"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {usageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setUsageModal(null)}>
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-white">
                Utilisateurs du code {usageModal.code}
              </h3>
              <button onClick={() => setUsageModal(null)} className="text-slate-400 hover:text-white" aria-label="Fermer">
                <X size={20} />
              </button>
            </div>
            {usageData.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Aucune utilisation enregistrée.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {usageData.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <span className="text-sm text-slate-300">{u.user_email}</span>
                    <span className="text-xs text-slate-500">{new Date(u.activated_at).toLocaleDateString("fr-CA")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
