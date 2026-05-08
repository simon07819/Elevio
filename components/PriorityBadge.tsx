"use client";

import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function PriorityBadge({ active, reason, size = "sm" }: { active: boolean; reason?: string | null; size?: "sm" | "lg" }) {
  const { t } = useLanguage();

  if (!active) {
    return <span className="rounded-full bg-slate-700/80 px-3 py-1 text-xs font-black text-slate-200">{t("priority.standard")}</span>;
  }

  const isLarge = size === "lg";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-red-400/50 bg-red-500/25 font-black text-red-100 anim-pulse-priority-badge ${isLarge ? "px-4 py-2 text-base" : "px-3 py-1 text-xs"}`}
      title={reason ?? t("priority.active")}
    >
      <AlertTriangle size={isLarge ? 20 : 14} />
      {isLarge ? t("priority.active") : t("priority.label")}
    </span>
  );
}
