"use client";

import { Ban, CheckCircle2, Users } from "lucide-react";
import type { Elevator } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function CapacityPanel({
  elevator,
  showCapacityStats = true,
  isTogglingFull = false,
  onToggleFull,
}: {
  elevator: Elevator;
  showCapacityStats?: boolean;
  isTogglingFull?: boolean;
  onToggleFull?: (manualFull: boolean) => void;
}) {
  const { t } = useLanguage();
  const load = elevator.current_load;
  const remaining = Math.max(0, elevator.capacity - load);
  const manualFull = elevator.manual_full === true;

  return (
    <section
      className={
        manualFull
          ? "rounded-3xl border border-red-400/40 bg-red-500/12 p-4"
          : "rounded-3xl border border-white/10 bg-white/8 p-4"
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
          {showCapacityStats ? t("operator.capacity") : t("operator.full")}
        </p>
        {manualFull ? <Ban className="text-red-200" /> : <Users className="text-slate-400" />}
      </div>
      {showCapacityStats ? (
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
      ) : (
        <p className="mt-3 text-sm font-bold leading-6 text-slate-200">{t("operator.fullHint")}</p>
      )}
      <button
        type="button"
        aria-busy={isTogglingFull}
        onClick={() => onToggleFull?.(!manualFull)}
        className={
          manualFull
            ? "touch-target mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-4 py-4 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_14px_34px_rgba(16,185,129,0.28)] active:scale-[0.99]"
            : "touch-target mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-4 text-sm font-black uppercase tracking-wide text-white shadow-[0_14px_34px_rgba(239,68,68,0.28)] active:scale-[0.99]"
        }
      >
        {manualFull ? <CheckCircle2 size={20} /> : <Ban size={20} />}
        {manualFull ? t("operator.resumePickup") : t("operator.full")}
      </button>
      {manualFull ? (
        <p className="mt-2 text-center text-xs font-bold text-red-100">{t("operator.fullHint")}</p>
      ) : null}
    </section>
  );
}
