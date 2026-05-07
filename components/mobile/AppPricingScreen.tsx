"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { Check, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { isIOS } from "@/lib/platform";
import { purchaseProduct } from "@/lib/billing/revenuecat";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "199 $",
    period: "/mois",
    desc: "Réduire les temps d'attente — 1 chantier actif",
    features: [
      "1 chantier actif",
      "2 opérateurs",
      "QR par étage",
      "Terminal opérateur",
      "Voir où le temps est perdu",
      "Heures de pointe et étages",
      "Support courriel",
    ],
    cta: "Choisir ce forfait",
    ctaHref: "/onboarding?plan=starter",
    productId: "com.elevio.starter.monthly" as const,
  },
  {
    id: "pro",
    name: "Pro",
    price: "499 $",
    period: "/mois",
    desc: "Optimiser la performance opérateur — dispatch intelligent",
    features: [
      "Jusqu'à 5 chantiers",
      "10 opérateurs",
      "Dispatch intelligent",
      "Mode Plein et sauter passage",
      "Score d'efficacité et analyses",
      "Métriques de performance opérateur",
      "Identifier les heures de pointe",
      "Prouver les gains de productivité",
    ],
    cta: "Choisir ce forfait",
    ctaHref: "/onboarding?plan=pro",
    productId: "com.elevio.pro.monthly" as const,
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sur mesure",
    period: "",
    desc: "Prouver les gains de productivité — multi-sites, SLA",
    features: [
      "Chantiers illimités",
      "Opérateurs illimités",
      "Rapports avancés multi-sites",
      "Rapports à l'échelle de l'entreprise",
      "Support personnalisé et intégration",
      "Intégrations personnalisées",
      "Code d'activation",
      "SLA garanti",
    ],
    cta: "Nous contacter",
    ctaHref: "/contact-enterprise",
  },
];

export function AppPricingScreen() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const iosPlatform = isIOS();

  async function handleIAPPurchase(planId: string, productId: string) {
    setLoading(planId);
    setMessage(null);
    try {
      const result = await purchaseProduct(productId as "com.elevio.starter.monthly" | "com.elevio.pro.monthly");
      if (result.ok) {
        // Use router.push instead of window.location.reload to avoid infinite reload loops
        router.push("/operator");
      } else {
        setMessage(result.error ?? "Erreur d'achat.");
        setTimeout(() => setMessage(null), 5000);
      }
    } catch {
      setMessage("Erreur d'achat. Réessayez.");
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setLoading(null);
    }
  }
  return (
    <main className="min-h-dvh bg-slate-950 px-5 py-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/welcome" className="touch-target rounded-2xl p-2 text-slate-400 hover:text-white">
          <ArrowLeft size={22} />
        </Link>
        <BrandLogo size="sm" priority tone="light" />
        <div className="w-10" />
      </div>

      {/* Title */}
      <div className="mt-6 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-400">Forfaits</p>
        <h1 className="mt-2 text-2xl font-black">Choisissez votre forfait</h1>
        <p className="mt-2 text-sm font-bold text-slate-400">
          Commencez gratuitement. Changez à tout moment.
        </p>
      </div>

      {/* Plan cards — stacked for mobile */}
      <div className="mt-8 space-y-4">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-3xl border p-5 ${
              plan.popular
                ? "border-yellow-400/40 bg-yellow-400/5 ring-2 ring-yellow-400/20"
                : "border-white/10 bg-white/5"
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-yellow-400 px-2.5 py-0.5 text-[10px] font-black text-slate-950 uppercase">
                Populaire
              </span>
            )}
            <div className="flex items-baseline gap-1">
              <h3 className="text-lg font-black">{plan.name}</h3>
              <span className="text-2xl font-black">{plan.price}</span>
              {plan.period && <span className="text-xs font-bold text-slate-400">{plan.period}</span>}
            </div>
            <p className="mt-1 text-xs font-bold text-slate-400">{plan.desc}</p>
            <ul className="mt-4 space-y-1.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Check size={12} className="shrink-0 text-emerald-400" />
                  {f}
                </li>
              ))}
            </ul>
            {plan.id === "enterprise" ? (
              <Link
                href={plan.ctaHref}
                className={`touch-target mt-4 block rounded-2xl px-4 py-3 text-center text-xs font-black uppercase tracking-wide transition active:scale-[0.98] ${
                  plan.popular
                    ? "bg-yellow-400 text-slate-950 hover:bg-yellow-300"
                    : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                {plan.cta}
              </Link>
            ) : iosPlatform ? (
              <button
                type="button"
                onClick={() => plan.productId && handleIAPPurchase(plan.id, plan.productId)}
                disabled={loading === plan.id}
                className={`touch-target mt-4 block w-full rounded-2xl px-4 py-3 text-center text-xs font-black uppercase tracking-wide transition active:scale-[0.98] disabled:opacity-50 ${
                  plan.popular
                    ? "bg-yellow-400 text-slate-950 hover:bg-yellow-300"
                    : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                {loading === plan.id ? "…" : plan.cta}
              </button>
            ) : (
              <Link
                href={plan.ctaHref}
                className={`touch-target mt-4 block rounded-2xl px-4 py-3 text-center text-xs font-black uppercase tracking-wide transition active:scale-[0.98] ${
                  plan.popular
                    ? "bg-yellow-400 text-slate-950 hover:bg-yellow-300"
                    : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Bottom link back to welcome */}
      <div className="mt-8 pb-6 text-center">
        {/* No "pay on website" link on iOS — App Store rule */}
        {!iosPlatform && (
          <Link href="/welcome" className="text-sm font-bold text-slate-500 hover:text-slate-300">
            Retour à l&apos;accueil
          </Link>
        )}
      </div>

      {/* IAP error message */}
      {message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-6 py-3 text-sm font-bold text-sky-100">
          {message}
        </div>
      )}
    </main>
  );
}
