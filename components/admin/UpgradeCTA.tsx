"use client";

import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { isIOS } from "@/lib/platform";

type UpgradeCTAProps = {
  feature: string;
  requiredPlan: "pro" | "enterprise";
  compact?: boolean;
};

export function UpgradeCTA({ feature, requiredPlan, compact = false }: UpgradeCTAProps) {
  const iosPlatform = isIOS();
  const href = iosPlatform ? "/paywall" : "/paywall";

  const planLabel = requiredPlan === "enterprise" ? "Enterprise" : "Pro";
  const planColor = requiredPlan === "enterprise"
    ? "from-amber-500/20 to-orange-500/10 border-amber-400/20 hover:border-amber-400/40"
    : "from-sky-500/20 to-blue-500/10 border-sky-400/20 hover:border-sky-400/40";
  const iconColor = requiredPlan === "enterprise" ? "text-amber-400" : "text-sky-400";

  if (compact) {
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${planColor} px-3 py-2 text-xs font-bold text-slate-300 transition`}
      >
        <Lock size={12} className={iconColor} />
        {feature} — <span className={iconColor}>{planLabel}</span>
      </Link>
    );
  }

  return (
    <div className={`rounded-3xl border bg-gradient-to-br ${planColor} p-5 backdrop-blur-sm`}>
      <div className="flex items-start gap-3">
        <Lock size={20} className={`mt-0.5 shrink-0 ${iconColor}`} />
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-200">{feature}</p>
          <p className="mt-1 text-xs text-slate-500">Available on {planLabel}</p>
        </div>
        <Link
          href={href}
          className={`flex items-center gap-1.5 rounded-xl bg-white/[0.06] border border-white/[0.1] px-4 py-2 text-xs font-black uppercase tracking-wide ${iconColor} transition hover:bg-white/[0.1]`}
        >
          <Sparkles size={14} />
          Upgrade
        </Link>
      </div>
    </div>
  );
}
