import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-4 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-4 lg:px-8">
        <div>
          <p className="text-lg font-black text-white">Elevio</p>
          <p className="mt-2 text-sm font-bold text-slate-400">
            Dispatch temps réel pour ascenseurs et élévateurs de chantier.
          </p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Produit</p>
          <ul className="mt-3 grid gap-2">
            <li><Link href="/pricing" className="text-sm font-bold text-slate-300 hover:text-white">Tarifs</Link></li>
            <li><Link href="/scan" className="text-sm font-bold text-slate-300 hover:text-white">Passager</Link></li>
            <li><Link href="/operator" className="text-sm font-bold text-slate-300 hover:text-white">Opérateur</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Entreprise</p>
          <ul className="mt-3 grid gap-2">
            <li><Link href="/contact-enterprise" className="text-sm font-bold text-slate-300 hover:text-white">Contact entreprise</Link></li>
            <li><Link href="/demo" className="text-sm font-bold text-slate-300 hover:text-white">Démo</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Légal</p>
          <ul className="mt-3 grid gap-2">
            <li><span className="text-sm font-bold text-slate-500">© {new Date().getFullYear()} DSD Construction</span></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
