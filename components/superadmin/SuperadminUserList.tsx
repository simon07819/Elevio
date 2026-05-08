"use client";

import { useState } from "react";
import { changeUserPlan, setUserSuspended, updateClientProfile } from "@/lib/superadminActions";
import { Badge } from "@/components/superadmin/Badge";
import { ManualPlanModal } from "@/components/superadmin/ManualPlanModal";
import type { PlanId } from "@/lib/billing/plans";
import { ADMIN_PLAN_IDS, PLANS } from "@/lib/billing/plans";
import type { AccountRole } from "@/lib/profile";
import { Pencil, CreditCard, X, Check, Loader2 } from "lucide-react";

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  account_role: string;
  created_at: string;
  suspended: boolean | null;
  plan: string;
  activatedVia: string;
  expiresAt: string | null;
  subscriptionStatus: string | null;
};

function sourceBadge(via: string) {
  switch (via) {
    case "default": return <Badge variant="default">Gratuit</Badge>;
    case "manual": return <Badge variant="yellow">Manuel</Badge>;
    case "manual_code": return <Badge variant="green">Code</Badge>;
    case "iap": return <Badge variant="default">App Store</Badge>;
    case "revenuecat": return <Badge variant="default">App Store</Badge>;
    case "stripe": return <Badge variant="default">Stripe</Badge>;
    case "admin": return <Badge variant="yellow">Admin</Badge>;
    case "activation_code": return <Badge variant="green">Code</Badge>;
    default: return via ? <Badge variant="default">{via}</Badge> : <Badge variant="default">—</Badge>;
  }
}

function planBadge(planId: string) {
  const plan = PLANS[planId as PlanId];
  if (!plan) return <Badge variant="default">{planId}</Badge>;
  if (planId === "free") return <Badge variant="default">{plan.label}</Badge>;
  if (planId === "enterprise") return <Badge variant="green">{plan.label}</Badge>;
  if (planId === "pro") return <Badge variant="yellow">{plan.label}</Badge>;
  return <Badge variant="default">{plan.label}</Badge>;
}

/** Single forfait display: badge + inline quick-change + expires hint */
function ForfaitCell({ plan, userId, loading, onChange }: { plan: string; userId: string; loading: string | null; onChange: (userId: string, newPlan: PlanId) => void }) {
  return (
    <div className="flex items-center gap-2">
      {planBadge(plan)}
      <select
        className="rounded-lg border border-white/10 bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400"
        value={plan}
        disabled={loading === userId}
        onChange={(e) => onChange(userId, e.target.value as PlanId)}
      >
        {ADMIN_PLAN_IDS.map((p) => (
          <option key={p} value={p}>{PLANS[p].label}</option>
        ))}
      </select>
    </div>
  );
}

function ProfileEditModal({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const [first_name, setFirstName] = useState(user.first_name ?? "");
  const [last_name, setLastName] = useState(user.last_name ?? "");
  const [company, setCompany] = useState(user.company ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [account_role, setAccountRole] = useState<AccountRole>(user.account_role as AccountRole);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateClientProfile({
      userId: user.id,
      first_name: first_name.trim() || null,
      last_name: last_name.trim() || null,
      company: company.trim() || null,
      phone: phone.trim() || null,
      account_role: account_role as AccountRole,
    });
    setMessage({ text: result.message, ok: result.ok });
    setSaving(false);
    if (result.ok) {
      setTimeout(() => { onSaved(); }, 1200);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-white">Modifier le profil</h2>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Email — read-only (auth constraint) */}
        <div className="mb-4 rounded-xl bg-white/5 p-3">
          <p className="text-xs font-black uppercase text-slate-500">Courriel</p>
          <p className="text-sm font-bold text-slate-300">{user.email}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">Le courriel ne peut pas être modifié ici (lié à l&apos;authentification).</p>
        </div>

        {message && (
          <div className={`mb-4 rounded-xl border p-3 text-sm font-bold ${message.ok ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-300" : "bg-red-400/10 border-red-400/20 text-red-300"}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-black uppercase text-slate-500">Prénom</label>
              <input type="text" value={first_name} onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black uppercase text-slate-500">Nom</label>
              <input type="text" value={last_name} onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">Compagnie</label>
            <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">Téléphone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">Rôle</label>
            <select value={account_role} onChange={(e) => setAccountRole(e.target.value as AccountRole)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-400/50">
              <option value="operator">Opérateur</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
              <option value="passenger">Passager</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            className="flex-1 rounded-xl bg-yellow-400/15 px-4 py-2.5 text-sm font-black text-yellow-300 hover:bg-yellow-400/25 disabled:opacity-50"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 size={16} className="anim-spinner inline" /> : <><Check size={16} className="inline" /> Enregistrer</>}
          </button>
          <button
            className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/15"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuperadminUserList({ users }: { users: UserRow[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [confirmFree, setConfirmFree] = useState<string | null>(null);

  async function handleChangePlan(userId: string, newPlan: PlanId) {
    if (newPlan === "free" && confirmFree !== userId) {
      setConfirmFree(userId);
      return;
    }
    setConfirmFree(null);
    setLoading(userId);
    setMessage(null);
    const result = await changeUserPlan(userId, newPlan);
    setMessage(result.message);
    setLoading(null);
    if (result.ok) window.location.reload();
  }

  async function handleSuspend(userId: string, suspend: boolean) {
    setLoading(userId);
    setMessage(null);
    const result = await setUserSuspended(userId, suspend);
    setMessage(result.message);
    setLoading(null);
    if (result.ok) window.location.reload();
  }

  return (
    <div>
      {message && (
        <div className="mb-4 rounded-xl bg-yellow-400/10 border border-yellow-400/20 p-3 text-sm font-bold text-yellow-300">
          {message}
        </div>
      )}

      {confirmFree && (
        <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm font-bold text-red-300">
          Ce membre sera remis au forfait gratuit et perdra l&apos;accès aux fonctions payantes. Continuer?
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg bg-red-500 px-3 py-1 text-xs font-bold text-white hover:bg-red-600"
              onClick={() => handleChangePlan(confirmFree, "free")}
            >
              Confirmer la résiliation
            </button>
            <button
              className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:bg-white/15"
              onClick={() => setConfirmFree(null)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs font-black uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4">Nom</th>
              <th className="pb-3 pr-4">Courriel</th>
              <th className="pb-3 pr-4">Compagnie</th>
              <th className="pb-3 pr-4">Forfait</th>
              <th className="pb-3 pr-4">Source</th>
              <th className="pb-3 pr-4">Rôle</th>
              <th className="pb-3 pr-4">Créé</th>
              <th className="pb-3 pr-4">Statut</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => (
              <tr key={u.id} className={u.suspended ? "opacity-50" : ""}>
                <td className="py-3 pr-4 font-bold text-white">
                  {u.first_name} {u.last_name}
                </td>
                <td className="py-3 pr-4 text-slate-300">{u.email}</td>
                <td className="py-3 pr-4 text-slate-400">{u.company ?? "—"}</td>
                <td className="py-3 pr-4">
                  <ForfaitCell plan={u.plan} userId={u.id} loading={loading} onChange={handleChangePlan} />
                  {u.expiresAt && (
                    <span className="text-[10px] text-slate-500">
                      {new Date(u.expiresAt) > new Date() ? "expire" : "exp."} {new Date(u.expiresAt).toLocaleDateString("fr-CA")}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-1">
                    {sourceBadge(u.activatedVia)}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={u.account_role === "superadmin" ? "yellow" : "default"}>
                    {u.account_role}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-xs text-slate-500">
                  {new Date(u.created_at).toLocaleDateString("fr-CA")}
                </td>
                <td className="py-3 pr-4">
                  {u.suspended ? (
                    <Badge variant="red">Suspendu</Badge>
                  ) : (
                    <Badge variant="green">Actif</Badge>
                  )}
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg bg-sky-400/15 px-3 py-1 text-xs font-bold text-sky-400 hover:bg-sky-400/25"
                      disabled={loading === u.id}
                      onClick={() => setEditUser(u)}
                    >
                      <Pencil size={12} className="inline mr-1" />Profil
                    </button>
                    <button
                      className="rounded-lg bg-yellow-400/15 px-3 py-1 text-xs font-bold text-yellow-400 hover:bg-yellow-400/25"
                      disabled={loading === u.id}
                      onClick={() => setModalUser(u)}
                    >
                      <CreditCard size={12} className="inline mr-1" />Forfait
                    </button>
                    {u.suspended ? (
                      <button
                        className="rounded-lg bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-400/25"
                        disabled={loading === u.id}
                        onClick={() => handleSuspend(u.id, false)}
                      >
                        Réactiver
                      </button>
                    ) : (
                      <button
                        className="rounded-lg bg-red-400/15 px-3 py-1 text-xs font-bold text-red-400 hover:bg-red-400/25"
                        disabled={loading === u.id}
                        onClick={() => handleSuspend(u.id, true)}
                      >
                        Suspendre
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <p className="mt-8 text-center text-slate-500">Aucun compte utilisateur.</p>
      )}

      {modalUser && (
        <ManualPlanModal
          userId={modalUser.id}
          email={modalUser.email}
          name={`${modalUser.first_name ?? ""} ${modalUser.last_name ?? ""}`.trim() || modalUser.email}
          currentPlan={modalUser.plan}
          activatedVia={modalUser.activatedVia}
          expiresAt={modalUser.expiresAt}
          onClose={() => setModalUser(null)}
          onSaved={() => { setModalUser(null); window.location.reload(); }}
        />
      )}

      {editUser && (
        <ProfileEditModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); window.location.reload(); }}
        />
      )}
    </div>
  );
}
