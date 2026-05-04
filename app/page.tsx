import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PricingGrid } from "@/components/public/PricingGrid";
import Link from "next/link";
import { ArrowRight, BarChart3, Clock, Layers, QrCode, Smartphone, Users } from "lucide-react";

export const metadata = {
  title: "Elevio — Dispatch temps réel pour ascenseurs de chantier",
  description:
    "Gérez vos élévateurs et ascenseurs de chantier en temps réel. Dispatch intelligent, QR passager, terminal opérateur.",
};

const FEATURES = [
  {
    icon: QrCode,
    title: "QR passager",
    desc: "Le passager scanne le QR de son étage et suit sa demande en temps réel.",
  },
  {
    icon: Smartphone,
    title: "Terminal opérateur",
    desc: "L'opérateur voit la prochaine action à faire — Ramasser, Déposer, Sauter — en un coup d'œil.",
  },
  {
    icon: Clock,
    title: "Dispatch intelligent",
    desc: "Le cerveau Elevio calcule l'ordre optimal des ramassages et déposes en temps réel.",
  },
  {
    icon: Users,
    title: "Multi-opérateurs",
    desc: "Plusieurs opérateurs et élévateurs sur le même chantier, sans conflit.",
  },
  {
    icon: Layers,
    title: "Multi-chantiers",
    desc: "Gérez tous vos chantiers depuis un seul compte. Jusqu'à 5 avec Pro, illimité avec Enterprise.",
  },
  {
    icon: BarChart3,
    title: "Métriques avancées",
    desc: "Temps d'attente, nombre de trajets, performance opérateur — en temps réel.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PublicNav />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-400">
            Dispatch temps réel
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Ascenseurs de chantier,{" "}
            <span className="text-yellow-400">enfin intelligents</span>
          </h1>
          <p className="mt-5 text-lg font-bold leading-8 text-slate-300">
            Elevio remplace les appels radio et les feutres par un dispatch
            temps réel. Le passager scanne un QR, l'opérateur suit le bon
            ordre, tout le monde gagne du temps.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/operator"
              className="touch-target rounded-2xl bg-yellow-400 px-8 py-4 text-base font-black text-slate-950 transition hover:bg-yellow-300 active:scale-[0.98]"
            >
              Essayer gratuitement
            </Link>
            <Link
              href="/pricing"
              className="touch-target flex items-center gap-2 rounded-2xl border border-white/15 px-8 py-4 text-base font-black text-white transition hover:bg-white/5 active:scale-[0.98]"
            >
              Voir les tarifs <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-white/10 bg-white/[0.02] px-4 py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            Tout ce qu'il faut, rien de superflu
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
              >
                <f.icon size={28} className="text-yellow-400" />
                <h3 className="mt-3 text-lg font-black">{f.title}</h3>
                <p className="mt-2 text-sm font-bold text-slate-400">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="px-4 py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            Des forfaits pour chaque taille de chantier
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-base font-bold text-slate-400">
            Commencez gratuitement, évoluez quand vous êtes prêt.
          </p>
          <div className="mt-12">
            <PricingGrid />
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
