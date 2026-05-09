"use client";

import Link from "next/link";
import { ArrowRight, Crown, Lock } from "lucide-react";
import { isCapacitorNative } from "@/lib/platform";

/**
 * Upgrade CTA shown to free-plan users when they try to access paid features.
 * Instead of showing a broken page with everything disabled, show this clear
 * message explaining the restriction and how to upgrade.
 */

export function UpgradePrompt({ feature }: { feature: string }) {
  const pricingHref = isCapacitorNative() ? "/app-pricing" : "/paywall";

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-amber-400/20 bg-amber-400/[0.06] p-8 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-amber-400/15 text-amber-400">
        <Lock size={28} />
      </div>
      <h2 className="mt-4 text-xl font-black text-white">
        Fonction réservée aux forfaits payants
      </h2>
      <p className="mt-2 text-sm font-bold text-slate-400">
        {feature} est disponible à partir du forfait Starter.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Votre forfait actuel (Gratuit) ne permet pas cette action.
      </p>
      <Link
        href={pricingHref}
        className="touch-target mt-6 inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300 active:scale-[0.98]"
      >
        <Crown size={16} />
        Voir les forfaits
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}

/**
 * Inline badge shown next to paid features to indicate they require an upgrade.
 */
export function UpgradeBadge() {
  const pricingHref = isCapacitorNative() ? "/app-pricing" : "/paywall";
  return (
    <Link
      href={pricingHref}
      className="inline-flex items-center gap-1 rounded-lg bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-400 hover:bg-amber-400/25 transition"
    >
      <Crown size={10} />
      Pro
    </Link>
  );
}
