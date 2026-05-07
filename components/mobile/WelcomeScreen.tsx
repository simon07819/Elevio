"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { signInWithApple, signInMobile } from "@/lib/mobileAuth";
import { isCapacitorNative } from "@/lib/platform";
import { Apple, ChevronRight, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WelcomeScreen() {
  const router = useRouter();
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleApple() {
    setLoading(true);
    setMessage(null);

    try {
      // Dynamic import — prevents plugin JS from evaluating at boot
      const { AppleSignIn, SignInScope } = await import("@capawesome/capacitor-apple-sign-in");

      if (isCapacitorNative()) {
        // ── NATIVE iOS: Use Capawesome Apple Sign-In plugin (Capacitor 8) ──
        const result = await AppleSignIn.signIn({
          scopes: [SignInScope.Email, SignInScope.FullName],
        });

        const { idToken, givenName, familyName } = result;

        if (!idToken) {
          setMessage("Erreur Apple : jeton manquant. Réessayez.");
          setLoading(false);
          return;
        }

        // Send the identityToken to the server action for Supabase verification
        const serverResult = await signInWithApple(idToken, {
          firstName: givenName,
          familyName: familyName,
        });

        if (!serverResult.ok) {
          setMessage(serverResult.message);
        }
        // If ok, the server action redirects (throws) — that's expected
      } else {
        // ── WEB BROWSER: Initialize then sign in ──
        try {
          const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_WEB_CLIENT_ID ?? process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
          if (!APPLE_CLIENT_ID) {
            console.error("[Apple] Missing env vars. Set NEXT_PUBLIC_APPLE_WEB_CLIENT_ID or NEXT_PUBLIC_APPLE_CLIENT_ID for Apple Sign-In on web.");
            setMessage("Connexion Apple indisponible sur navigateur. Utilisez votre courriel.");
            setLoading(false);
            return;
          }
          const origin = window.location.origin;

          await AppleSignIn.initialize({ clientId: APPLE_CLIENT_ID });

          const result = await AppleSignIn.signIn({
            redirectUrl: `${origin}/welcome`,
            scopes: [SignInScope.Email, SignInScope.FullName],
          });

          const { idToken, givenName, familyName } = result;

          if (!idToken) {
            setMessage("Erreur Apple : jeton manquant. Réessayez.");
            setLoading(false);
            return;
          }

          const serverResult = await signInWithApple(idToken, {
            firstName: givenName,
            familyName: familyName,
          });

          if (!serverResult.ok) {
            setMessage(serverResult.message);
          }
        } catch (webErr) {
          // Apple JS SDK failed (not configured, popup blocked, etc.)
          setMessage("Connexion Apple indisponible sur navigateur. Utilisez votre courriel.");
        }
      }
    } catch (err) {
      // redirect() throws — that's the normal success path
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
        return;
      }
      // User cancelled or real error
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cancel") || msg.includes("CANCELED") || msg.includes("SIGN_IN_CANCELED") || msg.includes("1001")) {
        setMessage(""); // User cancelled — no error message
      } else {
        setMessage(`Apple : ${msg.slice(0, 100)}`);
      }
    } finally {
      setLoading(false);
    }
  }

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
        {/* Apple Sign-In */}
        <button
          type="button"
          onClick={handleApple}
          disabled={loading}
          className="touch-target flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-base font-black text-slate-950 transition hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
        >
          <Apple size={20} />
          Continuer avec Apple
        </button>

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
        {message && (
          <p className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-100">
            {message}
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
        <Link href="/admin/login" className="text-xs font-bold text-slate-600 hover:text-slate-400">
          Admin
        </Link>
      </div>
    </main>
  );
}
