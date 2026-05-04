import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { Building2, Mail, Phone } from "lucide-react";

export const metadata = {
  title: "Elevio — Contact enterprise",
  description: "Contactez l'équipe commerciale Elevio pour un forfait Enterprise sur mesure.",
};

export default function ContactEnterprisePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PublicNav />

      <section className="mx-auto max-w-3xl px-4 pt-16 pb-20 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-400">
            Enterprise
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Un forfait sur mesure
          </h1>
          <p className="mt-4 text-lg font-bold text-slate-400">
            Chantiers illimités, multi-sites, intégrations personnalisées et support prioritaire.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <Building2 size={28} className="text-yellow-400" />
            <h2 className="mt-3 text-lg font-black">Ce qui est inclus</h2>
            <ul className="mt-4 space-y-2 text-sm font-bold text-slate-300">
              <li>Chantiers illimités</li>
              <li>Opérateurs illimités</li>
              <li>Multi-sites centralisés</li>
              <li>Support priorité 24/7</li>
              <li>Rapports avancés et exports</li>
              <li>Intégrations API personnalisées</li>
              <li>SLA garanti</li>
              <li>Code d'activation dédié</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/5 p-6">
            <h2 className="text-lg font-black">Nous contacter</h2>
            <p className="mt-3 text-sm font-bold text-slate-300">
              Parlez-nous de vos chantiers et nous préparerons une offre adaptée.
            </p>
            <ul className="mt-6 space-y-4">
              <li className="flex items-center gap-3">
                <Mail size={20} className="shrink-0 text-yellow-400" />
                <a
                  href="mailto:simon@dsdconstruction.ca?subject=Demande%20devis%20Elevio%20Enterprise"
                  className="text-sm font-black text-white underline decoration-yellow-400 underline-offset-4 hover:text-yellow-300"
                >
                  simon@dsdconstruction.ca
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={20} className="shrink-0 text-yellow-400" />
                <span className="text-sm font-bold text-slate-300">
                  Sur rendez-vous
                </span>
              </li>
            </ul>
            <a
              href="mailto:simon@dsdconstruction.ca?subject=Demande%20devis%20Elevio%20Enterprise&body=Bonjour%2C%0A%0AJ'aimerais%20obtenir%20un%20devis%20pour%20le%20forfait%20Elevio%20Enterprise.%0A%0ANombre%20de%20chantiers%20%3A%20%0ANombre%20d'op%C3%A9rateurs%20%3A%20%0A%0AMerci."
              className="touch-target mt-8 block rounded-2xl bg-yellow-400 px-6 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-[0.98]"
            >
              Envoyer une demande de devis
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
