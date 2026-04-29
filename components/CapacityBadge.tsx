"use client";

import { Users } from "lucide-react";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function CapacityBadge({
  passengerCount,
  capacity,
  remaining,
}: {
  passengerCount: number;
  capacity: number;
  remaining: number;
}) {
  const { t } = useLanguage();
  const exceedsTotal = passengerCount > capacity;
  const insufficient = passengerCount > remaining;

  if (exceedsTotal) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-300/40 bg-red-500/20 px-3 py-1 text-xs font-black text-red-100">
        <Users size={14} />
        {t("capacity.tooLarge")}
      </span>
    );
  }

  if (insufficient) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300/40 bg-yellow-300/20 px-3 py-1 text-xs font-black text-yellow-100">
        <Users size={14} />
        {t("capacity.nextPass")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-100">
      <Users size={14} />
      {t("capacity.ok")}
    </span>
  );
}
