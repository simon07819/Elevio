"use client";

import Link from "next/link";

export default function RequestError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-white">
      <h1 className="text-2xl font-black text-red-400">Erreur demande</h1>
      <p className="mt-3 max-w-md text-center text-sm text-slate-400">
        Impossible de charger la demande d&apos;ascenseur. Réessayez ou scannez un nouveau QR.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-yellow-300"
        >
          Réessayer
        </button>
        <Link
          href="/scan"
          className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10"
        >
          Scanner QR
        </Link>
      </div>
    </main>
  );
}
