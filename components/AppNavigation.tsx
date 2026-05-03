"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";

const navItems = [
  { href: "/", label: "nav.home" },
  { href: "/operator", label: "nav.operator" },
  { href: "/admin", label: "nav.admin" },
  { href: "/admin/profile", label: "nav.profile" },
  { href: "/support", label: "nav.support" },
] satisfies Array<{ href: string; label: TranslationKey }>;

export function AppNavigation({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();

  return (
    <nav className={compact ? "flex flex-wrap gap-2" : "no-print flex flex-wrap gap-2"}>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-slate-100 transition hover:border-yellow-300/50 hover:text-yellow-200"
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}
