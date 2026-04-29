"use client";

import Link from "next/link";
import { ArrowRight, LockKeyhole, QrCode } from "lucide-react";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";

const modes = [
  {
    href: "/request?projectId=project-demo-hoist&floorToken=demo-5",
    title: "mode.passenger",
    description: "mode.passengerBody",
    icon: QrCode,
    accent: "text-emerald-200",
  },
  {
    href: "/admin/login",
    title: "mode.admin",
    description: "mode.adminBody",
    icon: LockKeyhole,
    accent: "text-sky-200",
  },
] satisfies Array<{ href: string; title: TranslationKey; description: TranslationKey; icon: LucideIcon; accent: string }>;

export function ModeSelector() {
  const { t } = useLanguage();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {modes.map((mode) => {
        const Icon = mode.icon;

        return (
          <Link
            key={mode.href}
            href={mode.href}
            className="group glass-panel touch-target rounded-[2rem] p-5 transition duration-300 hover:-translate-y-1 hover:border-yellow-300/40"
          >
            <div className="mb-8 flex items-center justify-between">
              <span className={`grid size-14 place-items-center rounded-2xl bg-white/10 ${mode.accent}`}>
                <Icon size={28} />
              </span>
              <ArrowRight className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-yellow-300" />
            </div>
            <h2 className="text-2xl font-black text-white">{t(mode.title)}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{t(mode.description)}</p>
          </Link>
        );
      })}
    </div>
  );
}
