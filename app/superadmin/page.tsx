import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSuperadminDashboardData } from "@/lib/superadmin";
import {
  Users,
  Building2,
  HardHat,
  ClipboardList,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  UserPlus,
} from "lucide-react";

export default async function SuperadminDashboardPage() {
  const { user } = await requireSuperAdmin();
  const data = await getSuperadminDashboardData();

  const CARDS = [
    { label: "Nouveaux comptes (7j)", value: data.newAccounts7d, icon: UserPlus, color: "text-blue-400" },
    { label: "Comptes actifs", value: data.activeAccounts, icon: Users, color: "text-emerald-400" },
    { label: "Chantiers actifs", value: data.activeProjects, icon: Building2, color: "text-yellow-400" },
    { label: "Opérateurs actifs", value: data.activeOperators, icon: HardHat, color: "text-orange-400" },
    { label: "Demandes aujourd'hui", value: data.requestsToday, icon: ClipboardList, color: "text-purple-400" },
    { label: "Revenus estimés (mois)", value: `$${data.estimatedMonthlyRevenue}`, icon: CreditCard, color: "text-green-400" },
    { label: "Plans vendus", value: data.plansSold, icon: TrendingUp, color: "text-cyan-400" },
    { label: "Erreurs récentes (24h)", value: data.recentErrors24h, icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-black text-white">Dashboard Superadmin</h1>
        <p className="mt-1 text-sm font-bold text-slate-400">
          Connecté en tant que {user.email}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <Icon size={20} className={color} />
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p>
            </div>
            <p className="mt-3 text-3xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      {data.recentErrors.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xl font-black text-red-400">Erreurs récentes</h2>
          <div className="space-y-2">
            {data.recentErrors.slice(0, 10).map((err, i) => (
              <div key={i} className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm">
                <p className="font-bold text-red-300">{err.message || err.error || "Erreur inconnue"}</p>
                <p className="mt-1 text-xs text-slate-500">{err.created_at ?? ""}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.planDistribution.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xl font-black text-white">Distribution des plans</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.planDistribution.map(({ plan, count }) => (
              <div key={plan} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-lg font-black text-white">{plan}</p>
                <p className="text-2xl font-black text-yellow-400">{count}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
