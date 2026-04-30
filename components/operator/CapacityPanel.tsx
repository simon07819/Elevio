"use client";

import { Users } from "lucide-react";
import type { Elevator } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function CapacityPanel({ elevator }: { elevator: Elevator }) {
  const { t } = useLanguage();
  const load = elevator.current_load;
  const remaining = Math.max(0, elevator.capacity - load);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/8 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">{t("operator.capacity")}</p>
        <Users className="text-slate-400" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-white/10 p-2">
          <p className="text-xs font-bold text-slate-400">{t("operator.max")}</p>
          <p className="text-2xl font-black">{elevator.capacity}</p>
        </div>
        <div className="rounded-2xl bg-yellow-300 p-2 text-slate-950">
          <p className="text-xs font-black">{t("operator.onBoard")}</p>
          <p className="text-2xl font-black">{load}</p>
        </div>
        <div className="rounded-2xl bg-emerald-400/15 p-2 text-emerald-100">
          <p className="text-xs font-bold">{t("operator.remaining")}</p>
          <p className="text-2xl font-black">{remaining}</p>
        </div>
      </div>
    </section>
  );
}
