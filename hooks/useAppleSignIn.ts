"use client";

import { useState, useCallback } from "react";
import { signInWithApple } from "@/lib/mobileAuth";
import { isCapacitorNative } from "@/lib/platform";

/**
 * Shared Apple Sign-In hook for all auth screens.
 *
 * Handles:
 * - Native iOS (Capacitor): uses Capawesome plugin directly
 * - Web browser: uses Apple JS SDK with NEXT_PUBLIC_APPLE_WEB_CLIENT_ID
 * - Dynamic import only (no static imports → no JS Eval error at boot)
 * - Clear diagnostic logging for missing config
 * - Proper error messages for users and developers
 * - redirect() from server action (normal success path)
 *
 * Required config:
 * - Supabase Dashboard → Authentication → Providers → Apple → ENABLED
 *   (with Service ID, Team ID, Key ID, Private Key)
 * - Apple Developer: App ID with "Sign in with Apple" capability
 * - For web: NEXT_PUBLIC_APPLE_WEB_CLIENT_ID env var (Apple Services ID)
 */
export function useAppleSignIn() {
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    setAppleLoading(true);
    setAppleError(null);

    try {
      // Dynamic import — prevents plugin JS from evaluating at boot on iOS
      const { AppleSignIn, SignInScope } = await import("@capawesome/capacitor-apple-sign-in");

      if (isCapacitorNative()) {
        // ── NATIVE iOS: Use Capawesome Apple Sign-In plugin ──
        const result = await AppleSignIn.signIn({
          scopes: [SignInScope.Email, SignInScope.FullName],
        });

        const { idToken, givenName, familyName } = result;

        if (!idToken) {
          setAppleError("Erreur Apple : jeton manquant. Réessayez.");
          setAppleLoading(false);
          return;
        }

        const serverResult = await signInWithApple(idToken, {
          firstName: givenName,
          familyName: familyName,
        });

        if (!serverResult.ok) {
          setAppleError(serverResult.message);
        }
        // If ok, the server action redirects (throws) — handled below
      } else {
        // ── WEB BROWSER: Apple JS SDK ──
        const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_WEB_CLIENT_ID ?? process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";

        if (!APPLE_CLIENT_ID) {
          console.error(
            "[Apple Sign-In] Missing env vars for web Apple Sign-In.",
            "\n  Set NEXT_PUBLIC_APPLE_WEB_CLIENT_ID in .env.local (Apple Developer → Services IDs → Identifier)",
            "\n  Example: NEXT_PUBLIC_APPLE_WEB_CLIENT_ID=com.elevio.app.web",
            "\n  NOTE: On iOS Capacitor, this var is NOT needed — native plugin uses the Bundle ID.",
          );
          setAppleError("Connexion Apple indisponible. Utilisez votre courriel.");
          setAppleLoading(false);
          return;
        }

        try {
          const origin = window.location.origin;
          await AppleSignIn.initialize({ clientId: APPLE_CLIENT_ID });

          const result = await AppleSignIn.signIn({
            redirectUrl: `${origin}/auth/callback?next=/admin/profile%3Fonboarding%3D1`,
            scopes: [SignInScope.Email, SignInScope.FullName],
          });

          const { idToken, givenName, familyName } = result;

          if (!idToken) {
            setAppleError("Erreur Apple : jeton manquant. Réessayez.");
            setAppleLoading(false);
            return;
          }

          const serverResult = await signInWithApple(idToken, {
            firstName: givenName,
            familyName: familyName,
          });

          if (!serverResult.ok) {
            setAppleError(serverResult.message);
          }
        } catch (webErr) {
          console.error("[Apple Sign-In] Web SDK error:", webErr);
          setAppleError("Connexion Apple indisponible. Utilisez votre courriel.");
        }
      }
    } catch (err) {
      // redirect() throws — that's the normal success path from server actions
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);

      // User cancelled Apple Sign-In — no error shown
      if (msg.includes("cancel") || msg.includes("CANCELED") || msg.includes("SIGN_IN_CANCELED") || msg.includes("1001")) {
        setAppleError(null);
      } else {
        console.error("[Apple Sign-In] Unexpected error:", err);
        setAppleError(`Apple : ${msg.slice(0, 120)}`);
      }
    } finally {
      setAppleLoading(false);
    }
  }, []);

  return { signIn, appleLoading, appleError, setAppleError };
}
