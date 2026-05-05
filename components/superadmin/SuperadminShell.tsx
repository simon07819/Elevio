"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  ScrollText,
  FileText,
  Settings,
  Shield,
  BarChart3,
  Headset,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/superadmin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/superadmin/users", label: "Utilisateurs", icon: Users },
  { href: "/superadmin/accounts", label: "Compagnies", icon: Building2 },
  { href: "/superadmin/billing", label: "Abonnements", icon: CreditCard },
  { href: "/superadmin/metrics", label: "Métriques", icon: BarChart3 },
  { href: "/superadmin/logs", label: "Logs", icon: ScrollText },
  { href: "/superadmin/support", label: "Support", icon: Headset },
  { href: "/superadmin/content", label: "Contenu", icon: FileText },
  { href: "/superadmin/settings", label: "Configuration", icon: Settings },
];

export function SuperadminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/10 bg-slate-950 p-4">
        <div className="mb-6 flex items-center gap-2">
          <Shield size={24} className="text-yellow-400" />
          <span className="text-lg font-black text-yellow-400">SUPERADMIN</span>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/superadmin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  active
                    ? "bg-yellow-400/15 text-yellow-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
