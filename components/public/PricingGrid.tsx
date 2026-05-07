import Link from "next/link";
import { Check } from "lucide-react";

type PlanProps = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  cta: string;
  ctaHref: string;
};

function PlanCard({ name, price, period, description, features, popular, cta, ctaHref }: PlanProps) {
  return (
    <div
      className={`relative flex flex-col rounded-3xl border p-6 ${
        popular
          ? "border-yellow-400/40 bg-yellow-400/5 ring-2 ring-yellow-400/20"
          : "border-white/10 bg-white/5"
      }`}
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-slate-950 uppercase tracking-wide">
          Populaire
        </span>
      )}
      <h3 className="text-xl font-black text-white">{name}</h3>
      <p className="mt-1 text-sm font-bold text-slate-400">{description}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-black text-white">{price}</span>
        <span className="text-sm font-bold text-slate-400">{period}</span>
      </div>
      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm font-bold text-slate-300">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={`touch-target mt-6 block rounded-2xl px-4 py-3 text-center text-sm font-black uppercase tracking-wide transition active:scale-[0.98] ${
          popular
            ? "bg-yellow-400 text-slate-950 hover:bg-yellow-300"
            : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

const PLANS: PlanProps[] = [
  {
    name: "Starter",
    price: "199 $",
    period: "/mois",
    description: "Réduire les temps d'attente — 1 chantier actif",
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
    ctaHref: "/paywall",
  },
  {
    name: "Pro",
    price: "499 $",
    period: "/mois",
    description: "Optimiser la performance opérateur — dispatch intelligent",
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
    popular: true,
    cta: "Choisir ce forfait",
    ctaHref: "/paywall",
  },
  {
    name: "Enterprise",
    price: "Sur mesure",
    period: "",
    description: "Prouver les gains de productivité — multi-sites, SLA",
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

export function PricingGrid() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {PLANS.map((plan) => (
        <PlanCard key={plan.name} {...plan} />
      ))}
    </div>
  );
}
