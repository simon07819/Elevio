import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSuperadminDashboardData } from "@/lib/superadmin";
import { getPlatformAnalytics } from "@/lib/analytics";
import { AppShell } from "@/components/AppShell";
import { SuperadminAnalyticsDashboard } from "@/components/superadmin/SuperadminAnalyticsDashboard";
import {
  Users, Building2, CreditCard, BarChart3, AlertTriangle, HardHat,
} from "lucide-react";
import Link from "next/link";

const QUICK_LINKS = [
  { href: "/superadmin/users", label: "Utilisateurs", icon: Users },
  { href: "/superadmin/accounts", label: "Compagnies", icon: Building2 },
  { href: "/superadmin/billing", label: "Abonnements", icon: CreditCard },
  { href: "/superadmin/metrics", label: "Métriques", icon: BarChart3 },
  { href: "/superadmin/logs", label: "Logs", icon: AlertTriangle },
  { href: "/superadmin/support", label: "Support", icon: HardHat },
];

export const dynamic = "force-dynamic";

export default async function SuperadminDashboardPage() {
  const { user, profile } = await requireSuperAdmin();
  const data = await getSuperadminDashboardData();
  const platform = await getPlatformAnalytics(7);

  return (
    <AppShell userEmail={user.email} userRole={profile.account_role} eyebrow="Superadmin" title="Plateforme Elevio" subtitle={`Connecté en tant que ${user.email}`}>
      <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-yellow-400/30 hover:text-yellow-300 hover:bg-white/[0.06]"
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </div>

      <SuperadminAnalyticsDashboard data={data} platform={platform} />
    </AppShell>
  );
}
