import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PricingGrid } from "@/components/public/PricingGrid";
import Link from "next/link";

export const metadata = {
  title: "Elevio — Tarifs",
  description: "Forfaits Elevio pour ascenseurs et élévateurs de chantier. Free, Starter, Pro, Enterprise.",
};

const FAQS = [
  {
    q: "Puis-je changer de forfait en cours de mois ?",
    a: "Oui. Vous pouvez passer à un forfait supérieur à tout moment. Le prorata est calculé automatiquement.",
  },
  {
    q: "Le forfait Free est-il vraiment gratuit ?",
    a: "Oui. Aucune carte requise. Parfait pour tester Elevio sur un chantier pilote.",
  },
  {
    q: "Comment fonctionne le code d'activation Enterprise ?",
    a: "Votre représentant commercial vous fournit un code unique. Entrez-le dans l'application et votre compte est activé immédiatement.",
  },
  {
    q: "Les abonnements Apple sont-ils disponibles ?",
    a: "Les abonnements via l'App Store seront disponibles prochainement. En attendant, utilisez un code d'activation ou contactez-nous.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PublicNav />

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-400">
            Tarifs
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Un forfait pour chaque chantier
          </h1>
          <p className="mt-4 text-lg font-bold text-slate-400">
            Commencez gratuitement. Évoluez quand vos besoins grandissent.
          </p>
        </div>

        <div className="mt-14">
          <PricingGrid />
        </div>

        {/* Enterprise CTA */}
        <div className="mt-12 rounded-3xl border border-yellow-400/20 bg-yellow-400/5 p-8 text-center">
          <h2 className="text-2xl font-black">Besoin de plus ?</h2>
          <p className="mt-2 text-base font-bold text-slate-300">
            Chantiers illimités, multi-sites, intégrations personnalisées, SLA garanti.
          </p>
          <Link
            href="/contact-enterprise"
            className="touch-target mt-6 inline-block rounded-2xl bg-yellow-400 px-8 py-4 text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-[0.98]"
          >
            Contacter les ventes
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-white/10 px-4 py-20 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-black">Questions fréquentes</h2>
          <dl className="mt-10 grid gap-6">
            {FAQS.map((faq) => (
              <div key={faq.q} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <dt className="text-base font-black">{faq.q}</dt>
                <dd className="mt-2 text-sm font-bold text-slate-400">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
