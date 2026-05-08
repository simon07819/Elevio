"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ScrollText,
  FileText,
  Settings,
  Shield,
  BarChart3,
  Headset,
  ArrowLeft,
  Scale,
  DollarSign,
  Ticket,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";

type NavSection = { section: TranslationKey };
type NavLink = { href: string; label: TranslationKey; icon: typeof LayoutDashboard };
type NavItem = NavSection | NavLink;

function NAV_ITEMS(t: (k: TranslationKey) => string): NavItem[] {
  return [
    { section: "superadmin.platform" },
    { href: "/superadmin", label: "superadmin.dashboard", icon: LayoutDashboard },
    { href: "/superadmin/users", label: "superadmin.clients", icon: Users },
    { href: "/superadmin/billing", label: "superadmin.plansAndPricing", icon: DollarSign },
    { href: "/superadmin/codes", label: "superadmin.purchaseCodes", icon: Ticket },
    { href: "/superadmin/accounts", label: "superadmin.subscriptions", icon: CreditCard },
    { section: "superadmin.metrics" },
    { href: "/superadmin/metrics", label: "superadmin.platformMetrics", icon: BarChart3 },
    { href: "/superadmin/logs", label: "superadmin.logs", icon: ScrollText },
    { section: "superadmin.supportSection" },
    { href: "/superadmin/support/inbox", label: "superadmin.supportMessages", icon: Headset },
    { href: "/superadmin/support", label: "superadmin.supportContent", icon: FileText },
    { href: "/superadmin/legal", label: "superadmin.legalContent", icon: Scale },
    { section: "superadmin.configuration" },
    { href: "/superadmin/settings", label: "superadmin.platformSettings", icon: Settings },
  ];
}

export function SuperadminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const navItems = NAV_ITEMS(t);

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/10 bg-slate-950 p-4 flex flex-col">
        <div className="mb-4">
          <Link href="/" className="inline-flex">
            <BrandLogo size="sm" priority />
          </Link>
        </div>
        <div className="mb-6 flex items-center gap-2">
          <Shield size={24} className="text-yellow-400" />
          <span className="text-lg font-black text-yellow-400">{t("superadmin.badge")}</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item, i) => {
            if ("section" in item) {
              return (
                <p key={`s-${i}`} className="mt-4 mb-1 px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-600">
                  {t(item.section)}
                </p>
              );
            }
            const active = pathname === item.href || (item.href !== "/superadmin" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  active
                    ? "bg-yellow-400/15 text-yellow-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-white/10 pt-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft size={18} />
            {t("superadmin.backToApp")}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
