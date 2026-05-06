"use client";

import { useState } from "react";
import { Check, Crown, Loader2, Rocket, Sparkles, Zap, ArrowLeft } from "lucide-react";
import { PLANS, IAP_PLANS, type PlanId } from "@/lib/billing/plans";
import { activateEnterpriseCode, type ActivationResult } from "@/lib/billing/activation";
import { purchaseProduct } from "@/lib/billing/revenuecat";
import { createStripeCheckout } from "@/lib/billing/checkout";
import { isIOS } from "@/lib/platform";
import { useRouter } from "next/navigation";
import Link from "next/link";

function PlanCard({ planId, onSubscribe, isIOSPlatform }: { planId: PlanId; onSubscribe: (planId: PlanId) => void; isIOSPlatform: boolean }) {
  const plan = PLANS[planId];

  return (
    <div className={`relative flex flex-col rounded-3xl border p-6 ${plan.popular ? "border-sky-400/50 bg-sky-950/30 ring-2 ring-sky-400/30" : "border-white/10 bg-white/5"}`}>
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-400 px-3 py-1 text-xs font-black text-slate-950 uppercase tracking-wide">
          Populaire
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        {planId === "starter" ? <Rocket size={20} className="text-emerald-300" /> : <Zap size={20} className="text-sky-300" />}
        <h3 className="text-xl font-black text-white">{plan.label}</h3>
      </div>
      <p className="text-sm font-bold text-slate-400 mb-4">{plan.description}</p>

      <div className="mb-4">
        {plan.priceAnnual !== null ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{plan.priceAnnual}</span>
            <span className="text-sm font-bold text-slate-400">$CA/an</span>
          </div>
        ) : null}
        {plan.priceMonthly !== null ? (
          <p className="text-sm font-bold text-slate-500">ou {plan.priceMonthly} $CA/mois</p>
        ) : null}
      </div>

      <ul className="mb-6 space-y-2 flex-1">
        <Feature text={`${plan.limits.maxProjects ?? "∞"} chantier${(plan.limits.maxProjects ?? 2) > 1 ? "s" : ""}`} />
        <Feature text={`${plan.limits.maxOperators ?? "∞"} opérateur${(plan.limits.maxOperators ?? 2) > 1 ? "s" : ""}`} />
        {plan.limits.analytics !== "none" && <Feature text={`Analytics ${plan.limits.analytics === "advanced" ? "avancés" : "simples"}`} />}
        {plan.limits.efficiencyScore && <Feature text="Efficiency score" />}
        {plan.limits.businessInsights && <Feature text="Business insights" />}
        {plan.limits.operatorPerformance && <Feature text="Operator performance" />}
        {plan.limits.multiOperator && <Feature text="Multi-opérateur" />}
        {plan.limits.prioritySupport && <Feature text="Support prioritaire" />}
        {!plan.limits.efficiencyScore && plan.limits.analytics !== "none" && <Feature text="See where time is lost" />}
      </ul>

      {plan.iapAvailable ? (
        <button
          type="button"
          onClick={() => onSubscribe(planId)}
          className={`touch-target w-full rounded-2xl px-4 py-3 text-sm font-black uppercase tracking-wide transition active:scale-[0.98] ${plan.popular ? "bg-sky-400 text-slate-950 hover:bg-sky-300" : "bg-white/10 text-white hover:bg-white/15"}`}
        >
          S&apos;abonner
        </button>
      ) : null}
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 text-sm font-bold text-slate-300">
      <Check size={14} className="shrink-0 text-emerald-400" />
      {text}
    </li>
  );
}

function EnterpriseContactCard({ isIOSPlatform }: { isIOSPlatform: boolean }) {
  return (
    <div className="rounded-3xl border border-amber-400/25 bg-amber-950/20 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Crown size={20} className="text-amber-300" />
        <h3 className="text-xl font-black text-amber-100">Business & Enterprise</h3>
      </div>
      <p className="text-sm font-bold text-amber-200/80 mb-4">
        Chantiers et opérateurs personnalisés, support prioritaire, contrat annuel.
      </p>
      <ul className="mb-6 space-y-2">
        <Feature text="Chantiers personnalisés" />
        <Feature text="Opérateurs personnalisés" />
        <Feature text="Support prioritaire" />
        <Feature text="Contrat annuel" />
        <Feature text="Activation par code" />
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* On iOS: only activation code (no external email link — App Store rule) */}
        {!isIOSPlatform && (
          <a
            href="mailto:simon@dsdconstruction.ca?subject=Demande%20devis%20Elevio%20Business"
            className="touch-target flex items-center justify-center gap-2 rounded-2xl bg-amber-400/15 border border-amber-400/25 px-4 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-400/25 active:scale-[0.98]"
          >
            <Sparkles size={16} />
            Obtenir un devis
          </a>
        )}
        <a
          href="#activation"
          className={`touch-target flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-black text-slate-300 transition hover:bg-white/10 active:scale-[0.98] ${isIOSPlatform ? "sm:col-span-2" : ""}`}
        >
          Activer avec un code
        </a>
      </div>
    </div>
  );
}

function ActivationCodeBox() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ActivationResult | null>(null);

  async function handleActivate() {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await activateEnterpriseCode(code);
      setResult(res);
      if (res.ok) setCode("");
    } catch {
      setResult({ ok: false, message: "Erreur réseau. Réessayez." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="activation" className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-black text-white mb-2">Activer avec un code</h3>
      <p className="text-sm font-bold text-slate-400 mb-4">
        Entrez votre code d&apos;activation Enterprise fourni par votre représentant.
      </p>
      <div className="flex gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="EX: ELEV-ENT-XXXX"
          className="flex-1 rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-base font-black text-white placeholder:text-slate-600 outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
        />
        <button
          type="button"
          onClick={handleActivate}
          disabled={loading || !code.trim()}
          className="touch-target rounded-2xl bg-sky-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:opacity-50 disabled:cursor-wait active:scale-[0.98]"
        >
          {loading ? <Loader2 size={16} className="anim-spinner" /> : "Activer"}
        </button>
      </div>
      {result && (
        <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${result.ok ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border border-red-400/30 bg-red-500/10 text-red-100"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}

export function PaywallClient({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [iapMessage, setIapMessage] = useState<string | null>(null);
  const iosPlatform = isIOS();

  async function handleSubscribe(planId: PlanId) {
    if (iosPlatform) {
      // iOS: RevenueCat IAP ONLY — never Stripe
      const result = await purchaseProduct(planId === "starter" ? "com.elevio.starter.monthly" : "com.elevio.pro.monthly");
      if (result.ok) {
        // Use router.push instead of window.location.reload to avoid infinite reload loops on Capacitor.
        // The SubscriptionSyncProvider will sync RevenueCat → Supabase on the next render.
        router.push("/operator");
        return;
      }
      setIapMessage(result.error ?? "Erreur d'achat.");
      setTimeout(() => setIapMessage(null), 5000);
      return;
    }

    // Web: try RevenueCat first (in case running native via other means), then Stripe
    try {
      const result = await purchaseProduct(planId === "starter" ? "com.elevio.starter.monthly" : "com.elevio.pro.monthly");
      if (result.ok) {
        router.push("/admin/projects");
        return;
      }
    } catch {
      // RevenueCat not available on web
    }

    // Stripe Checkout (web only — blocked on iOS by isIOS guard above)
    const result = await createStripeCheckout({
      planId,
      period: "monthly",
      userId,
      email,
      isIOS: false, // Already blocked above, but pass explicit flag for server-side guard
    });

    if (result.url) {
      window.location.href = result.url;
    } else {
      setIapMessage(result.error ?? "Paiement non disponible pour le moment.");
      setTimeout(() => setIapMessage(null), 5000);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="touch-target inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
          <ArrowLeft size={14} />
          Back
        </Link>
      </div>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black text-white mb-2">Choisissez votre plan</h1>
        <p className="text-lg font-bold text-slate-400">
          Démarrez gratuitement, évoluez selon vos besoins.
        </p>
      </div>

      {iapMessage && (
        <div className="mb-6 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-center text-sm font-bold text-sky-100">
          {iapMessage}
        </div>
      )}

      {/* IAP plans: Starter + Pro */}
      <div className="grid gap-6 mb-8 sm:grid-cols-2">
        {IAP_PLANS.map((planId) => (
          <PlanCard key={planId} planId={planId} onSubscribe={handleSubscribe} isIOSPlatform={iosPlatform} />
        ))}
      </div>

      {/* Business + Enterprise */}
      <div className="mb-8">
        <EnterpriseContactCard isIOSPlatform={iosPlatform} />
      </div>

      {/* Activation code */}
      <ActivationCodeBox />

      {/* No "pay on website" text on iOS — App Store rule 3.1.1 */}
      {!iosPlatform && (
        <p className="mt-6 text-center text-xs font-bold text-slate-500">
          Le plan Starter (1 chantier, 2 opérateurs) est actif par défaut. Aucune carte requise.
        </p>
      )}

      {/* Restore Purchases — required by App Store for IAP apps */}
      {iosPlatform && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={async () => {
              const { restorePurchases } = await import("@/lib/billing/revenuecat");
              const entitlement = await restorePurchases();
              if (entitlement?.isActive) {
                router.push("/operator");
              } else {
                setIapMessage("Aucun achat antérieur trouvé.");
                setTimeout(() => setIapMessage(null), 5000);
              }
            }}
            className="text-xs font-bold text-slate-500 hover:text-slate-300 underline"
          >
            Restaurer les achats
          </button>
        </div>
      )}
    </div>
  );
}
