"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { Check, ArrowLeft } from "lucide-react";
import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "0 $",
    period: "pour toujours",
    desc: "Essai gratuit — 1 chantier test",
    features: [
      "1 chantier test",
      "1 opérateur",
      "Demandes limitées",
      "QR par étage",
      "Terminal passager",
    ],
    cta: "Commencer",
    ctaHref: "/onboarding",
  },
  {
    id: "starter",
    name: "Starter",
    price: "29 $",
    period: "/mois",
    desc: "Petite équipe — 1 chantier actif",
    features: [
      "1 chantier actif",
      "2 opérateurs",
      "QR par étage",
      "Terminal opérateur",
      "Logs simples",
      "Support courriel",
    ],
    cta: "S'abonner",
    ctaHref: "/onboarding?plan=starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: "79 $",
    period: "/mois",
    desc: "Multi-chantiers — dispatch intelligent",
    features: [
      "Jusqu'à 5 chantiers",
      "Opérateurs illimités",
      "Dispatch intelligent",
      "Mode Plein",
      "Sauter un passage",
      "Métriques avancées",
      "Support prioritaire",
    ],
    cta: "S'abonner",
    ctaHref: "/onboarding?plan=pro",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sur mesure",
    period: "",
    desc: "Grands chantiers — multi-sites",
    features: [
      "Chantiers illimités",
      "Multi-sites",
      "Support priorité",
      "Rapports avancés",
      "Intégrations personnalisées",
      "Code d'activation",
    ],
    cta: "Contacter",
    ctaHref: "/contact-enterprise",
  },
];

export function AppPricingScreen() {
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
          </div>
        ))}
      </div>

      {/* Bottom link back to welcome */}
      <div className="mt-8 pb-6 text-center">
        <Link href="/welcome" className="text-sm font-bold text-slate-500 hover:text-slate-300">
          Retour à l'accueil
        </Link>
      </div>
    </main>
  );
}
