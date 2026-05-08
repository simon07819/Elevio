import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import Link from "next/link";
import { Play } from "lucide-react";

export const metadata = {
  title: "Elevio — Démo en ligne",
  description: "Essayez Elevio gratuitement avec un chantier de démonstration.",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PublicNav />

      <section className="mx-auto max-w-3xl px-4 pt-16 pb-20 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-400">
            Démo
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Essayez Elevio maintenant
          </h1>
          <p className="mt-4 text-lg font-bold text-slate-400">
            Créez un compte gratuit et testez Elevio sur un chantier de
            démonstration. Aucune carte requise.
          </p>
        </div>

        <div className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-black">Ce que vous verrez</h2>
          <ul className="mt-4 space-y-3 text-sm font-bold text-slate-300">
            <li className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-yellow-400" />
              Terminal passager — scannez un QR pour créer une demande
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-yellow-400" />
              Terminal opérateur — voyez Ramasser / Déposer / Sauter en temps réel
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-yellow-400" />
              Dispatch intelligent — le cerveau calcule l'ordre optimal
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-yellow-400" />
              Métriques et tableaux de bord admin
            </li>
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/admin"
              className="touch-target flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-[0.98]"
            >
              <Play size={18} />
              Lancer la démo
            </Link>
            <Link
              href="/pricing"
              className="touch-target flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-6 py-4 text-sm font-black text-white transition hover:bg-white/5 active:scale-[0.98]"
            >
              Voir les forfaits
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
