"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCode, HardHat, Settings, MessageCircle } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/components/i18n/LanguageProvider";

const NAV_ITEMS = [
  { href: "/scan", label: "nav.scan" as TranslationKey, icon: QrCode },
  { href: "/operator", label: "nav.operator" as TranslationKey, icon: HardHat },
  { href: "/admin", label: "nav.admin" as TranslationKey, icon: Settings },
  { href: "/support", label: "nav.support" as TranslationKey, icon: MessageCircle },
];

/**
 * Mobile bottom navigation bar — fixed at bottom of screen.
 * Only visible on small screens (sm:hidden).
 * Provides quick access to the 4 main sections.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 backdrop-blur sm:hidden">
      <div className="flex items-center justify-around px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`touch-target flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition ${
                active
                  ? "text-yellow-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              prefetch={true}
            >
              <Icon size={18} />
              <span className="text-[10px] font-black">{t(label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
