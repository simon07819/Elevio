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
      {/* Sidebar — collapsible on small screens, fixed on large */}
      {/* Mobile toggle */}
      <input type="checkbox" id="sa-sidebar-toggle" className="peer/sa hidden" defaultChecked />
      <label
        htmlFor="sa-sidebar-toggle"
        className="fixed inset-0 z-30 bg-black/50 peer-checked/sa:hidden lg:hidden"
        aria-label="Toggle sidebar"
      />
      {/* Sidebar panel */}
      <aside className="fixed inset-y-0 left-0 z-40 w-56 shrink-0 border-r border-white/10 bg-slate-950 p-4 flex flex-col -translate-x-full peer-checked/sa:translate-x-0 lg:static lg:translate-x-0 transition-transform duration-200 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]">
        <div className="mb-4">
          <Link href="/" className="inline-flex">
            <BrandLogo size="sm" priority />
          </Link>
        </div>
        <div className="mb-6 flex items-center gap-2">
          <Shield size={24} className="text-yellow-400" />
          <span className="text-lg font-black text-yellow-400">{t("superadmin.badge")}</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
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
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar with sidebar toggle */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur-lg lg:hidden pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)]">
          <label htmlFor="sa-sidebar-toggle" className="touch-target rounded-xl bg-white/5 p-2.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Open sidebar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h14M3 10h14M3 14h14" /></svg>
          </label>
          <Link href="/" className="inline-flex">
            <BrandLogo size="sm" priority />
          </Link>
          <Shield size={18} className="text-yellow-400" />
          <span className="text-sm font-black text-yellow-400">{t("superadmin.badge")}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-[1600px] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]">
          {children}
        </main>
      </div>
    </div>
  );
}
