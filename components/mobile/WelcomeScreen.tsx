"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { signInMobile } from "@/lib/mobileAuth";
import { useAppleSignIn } from "@/hooks/useAppleSignIn";
import { isCapacitorNative } from "@/lib/platform";
import { Apple, ChevronRight, Mail } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

export function WelcomeScreen() {
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn: handleApple, appleLoading, appleError } = useAppleSignIn();
  const [isNative, setIsNative] = useState(false);
  useEffect(() => { setIsNative(isCapacitorNative()); }, []);

  async function handleEmailLogin(formData: FormData) {
    setLoading(true);
    setMessage(null);
    try {
      const result = await signInMobile(formData);
      if (result.ok) {
        // Server action handles redirect
      } else {
        setMessage(result.message);
      }
    } catch {
      // redirect() throws — that's OK
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-slate-950 px-6 py-8 text-white">
      {/* Top spacer */}
      <div className="flex-1" />

      {/* Brand */}
      <div className="text-center">
        <div className="flex justify-center">
          <BrandLogo size="lg" priority tone="light" clickable />
        </div>
        <p className="mt-4 text-lg font-bold text-slate-400">
          Dispatch temps réel pour ascenseurs de chantier
        </p>
      </div>

      {/* CTA area */}
      <div className="mt-12 space-y-3">
        {/* Apple Sign-In — native iOS only */}
        {isNative && (
          <button
            type="button"
            onClick={handleApple}
            disabled={loading || appleLoading}
            className="touch-target flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-base font-black text-slate-950 transition hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
          >
            <Apple size={20} />
            {appleLoading ? "Connexion…" : "Continuer avec Apple"}
          </button>
        )}

        {/* Email toggle */}
        <button
          type="button"
          onClick={() => setShowEmail((v) => !v)}
          className="touch-target flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-base font-black text-white transition hover:bg-white/10 active:scale-[0.98]"
        >
          <Mail size={20} />
          Se connecter
        </button>

        {/* Email form */}
        {showEmail && (
          <form action={handleEmailLogin} className="mt-4 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Courriel</label>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@compagnie.ca"
                className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Mot de passe</label>
              <input
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email || password.length < 6}
              className="touch-target w-full rounded-2xl bg-yellow-400 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-yellow-300 disabled:opacity-50 active:scale-[0.98]"
            >
              Se connecter
            </button>
          </form>
        )}

        {/* Message */}
        {(message || appleError) && (
          <p className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-100">
            {appleError || message}
          </p>
        )}
      </div>

      {/* Bottom links */}
      <div className="mt-8 space-y-3 text-center">
        <Link
          href="/onboarding"
          className="touch-target flex items-center justify-center gap-1 text-sm font-black text-yellow-300"
        >
          Créer un compte <ChevronRight size={16} />
        </Link>
        <Link
          href="/app-pricing"
          className="block text-sm font-bold text-slate-500"
        >
          Voir les forfaits
        </Link>
      </div>

      {/* Bottom spacer */}
      <div className="flex-1" />

      {/* Existing user shortcuts */}
      <div className="flex items-center justify-center gap-4 pb-4">
        <Link href="/operator" className="text-xs font-bold text-slate-600 hover:text-slate-400">
          Opérateur
        </Link>
        <span className="text-slate-800">|</span>
        <Link href="/scan" className="text-xs font-bold text-slate-600 hover:text-slate-400">
          Passager
        </Link>
        <span className="text-slate-800">|</span>
        <Link href="/admin" className="text-xs font-bold text-slate-600 hover:text-slate-400">
          Admin
        </Link>
      </div>
    </main>
  );
}
