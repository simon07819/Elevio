"use client";

import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function PriorityBadge({ active, reason }: { active: boolean; reason?: string | null }) {
  const { t } = useLanguage();

  if (!active) {
    return <span className="rounded-full bg-slate-700/80 px-3 py-1 text-xs font-black text-slate-200">{t("priority.standard")}</span>;
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-400/20 px-3 py-1 text-xs font-black text-orange-100"
      title={reason ?? t("priority.active")}
    >
      <AlertTriangle size={14} />
      {t("priority.label")}
    </span>
  );
}
