import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSuperadminBilling } from "@/lib/superadmin";
import { Badge } from "@/components/superadmin/Badge";
import { SuperadminPlanEditor } from "@/components/superadmin/SuperadminPlanEditor";

export default async function SuperadminBillingPage() {
  await requireSuperAdmin();
  const { subscriptions, payments, source } = await getSuperadminBilling();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-white">Facturation</h1>

      {source === "entitlements" ? (
        <div className="mb-6 rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
          <p className="text-sm font-bold text-yellow-300">
            Mode démo — Stripe non configuré. Les données ci-dessous reflètent les plans assignés, pas les paiements réels. Configurez STRIPE_SECRET_KEY pour les données réelles.
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
          <p className="text-sm font-bold text-emerald-300">
            Données Stripe en temps réel — abonnements et paiements synchronisés.
          </p>
        </div>
      )}

      <h2 className="mb-3 text-xl font-black text-white">Forfaits</h2>
      <div className="mb-8">
        <SuperadminPlanEditor />
      </div>

      <h2 className="mb-3 text-xl font-black text-white">Abonnements</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs font-black uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4">Utilisateur</th>
              <th className="pb-3 pr-4">Plan</th>
              <th className="pb-3 pr-4">Activé via</th>
              <th className="pb-3 pr-4">Début</th>
              <th className="pb-3 pr-4">Expiration</th>
              <th className="pb-3">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {subscriptions.map((s, i) => (
              <tr key={i} className={s.status === "past_due" ? "bg-red-400/5" : s.status === "expired" || s.status === "canceled" ? "opacity-50" : ""}>
                <td className="py-3 pr-4 font-mono text-xs text-slate-300">{s.userId.slice(0,8)}</td>
                <td className="py-3 pr-4 font-bold text-white">{s.plan}</td>
                <td className="py-3 pr-4 text-slate-400">{s.provider}</td>
                <td className="py-3 pr-4 text-xs text-slate-500">
                  {s.startDate ? new Date(s.startDate).toLocaleDateString("fr-CA") : "—"}
                </td>
                <td className="py-3 pr-4 text-xs text-slate-500">
                  {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("fr-CA") : "—"}
                </td>
                <td className="py-3">
                  <Badge variant={s.status === "active" || s.status === "trialing" ? "green" : s.status === "past_due" ? "yellow" : "red"}>
                    {s.status === "active" ? "Actif" : s.status === "trialing" ? "Essai" : s.status === "past_due" ? "En retard" : s.status === "canceled" ? "Annulé" : s.status === "expired" ? "Expiré" : s.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {subscriptions.length === 0 && (
        <p className="mt-4 text-center text-slate-500">Aucun abonnement.</p>
      )}

      <h2 className="mb-3 mt-8 text-xl font-black text-white">Paiements</h2>
      {payments.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-slate-400">Aucun paiement enregistré.</p>
          <p className="mt-2 text-xs text-slate-500">Connectez Stripe ou RevenueCat pour voir les transactions réelles.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-black uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Montant</th>
                <th className="pb-3 pr-4">Plan</th>
                <th className="pb-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={i}>
                  <td className="py-3 pr-4 text-slate-300">{String(p.date ?? "—")}</td>
                  <td className="py-3 pr-4 font-bold text-white">{String(p.amount ?? "—")}</td>
                  <td className="py-3 pr-4 text-slate-400">{String(p.plan ?? "—")}</td>
                  <td className="py-3"><Badge variant="green">{String(p.status ?? "—")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
