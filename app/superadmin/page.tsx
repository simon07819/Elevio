import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { getSuperadminDashboardData } from "@/lib/superadmin";
import { getPlatformAnalytics } from "@/lib/analytics";
import { SuperadminAnalyticsDashboard } from "@/components/superadmin/SuperadminAnalyticsDashboard";
import { getServerLocale, serverT } from "@/lib/i18nServer";
import {
  Users, CreditCard, BarChart3, AlertTriangle, DollarSign,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SuperadminDashboardPage() {
  const { user } = await requireSuperAdmin();
  const data = await getSuperadminDashboardData();
  const platform = await getPlatformAnalytics(7);
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof serverT>[1], values?: Parameters<typeof serverT>[2]) => serverT(locale, key, values);

  const QUICK_LINKS = [
    { href: "/superadmin/users", label: t("superadmin.clients"), icon: Users },
    { href: "/superadmin/billing", label: t("superadmin.plansAndPricing"), icon: DollarSign },
    { href: "/superadmin/metrics", label: t("superadmin.metrics"), icon: BarChart3 },
    { href: "/superadmin/logs", label: t("superadmin.logs"), icon: AlertTriangle },
  ];

  return (
    <>
      <h1 className="text-2xl font-black text-white mb-1">{t("superadmin.dashboardTitle")}</h1>
      <p className="text-sm text-slate-400 mb-6">{t("superadmin.loggedInAs", { email: user.email ?? "" })}</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
    </>
  );
}
