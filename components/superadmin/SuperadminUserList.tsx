"use client";

import { useState } from "react";
import { changeUserPlan, setUserSuspended } from "@/lib/superadminActions";
import { Badge } from "@/components/superadmin/Badge";
import { ManualPlanModal } from "@/components/superadmin/ManualPlanModal";
import type { PlanId } from "@/lib/billing/plans";
import { VISIBLE_PLAN_IDS, PLANS } from "@/lib/billing/plans";

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
};

function sourceBadge(via: string) {
  switch (via) {
    case "manual": return <Badge variant="yellow">Manuel</Badge>;
    case "iap": case "revenuecat": return <Badge variant="default">App Store</Badge>;
    case "stripe": return <Badge variant="default">Stripe</Badge>;
    case "admin": return <Badge variant="yellow">Admin</Badge>;
    case "activation_code": return <Badge variant="green">Code</Badge>;
    default: return <Badge variant="default">—</Badge>;
  }
}

export function SuperadminUserList({ users }: { users: UserRow[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalUser, setModalUser] = useState<UserRow | null>(null);

  async function handleChangePlan(userId: string, newPlan: PlanId) {
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs font-black uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4">Nom</th>
              <th className="pb-3 pr-4">Courriel</th>
              <th className="pb-3 pr-4">Compagnie</th>
              <th className="pb-3 pr-4">Plan</th>
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
                  <select
                    className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs font-bold text-white"
                    value={u.plan}
                    disabled={loading === u.id}
                    onChange={(e) => handleChangePlan(u.id, e.target.value as PlanId)}
                  >
                    {VISIBLE_PLAN_IDS.map((p) => (
                      <option key={p} value={p}>{PLANS[p].label}</option>
                    ))}
                  </select>
                </td>
                <td className="py-3 pr-4">
                  {sourceBadge(u.activatedVia)}
                  {u.expiresAt && (
                    <span className="ml-1 text-xs text-slate-500">
                      {new Date(u.expiresAt) > new Date() ? "→" : "exp."} {new Date(u.expiresAt).toLocaleDateString("fr-CA")}
                    </span>
                  )}
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
                      className="rounded-lg bg-yellow-400/15 px-3 py-1 text-xs font-bold text-yellow-400 hover:bg-yellow-400/25"
                      disabled={loading === u.id}
                      onClick={() => setModalUser(u)}
                    >
                      Attribuer forfait
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
    </div>
  );
}
