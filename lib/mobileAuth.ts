"use server";

/**
 * Mobile auth — real Apple Sign-In + email login.
 *
 * Apple Sign-In flow:
 * 1. Client calls @capawesome/capacitor-apple-sign-in (Capacitor 8)
 *    → native Apple auth sheet on iOS, Apple JS SDK on web
 * 2. Gets identityToken (JWT) + optional fullName
 * 3. Posts to signInWithApple(identityToken, fullName) server action
 * 4. Supabase verifies the id_token via signInWithIdToken({ provider: "apple" })
 * 5. Profile ensured, user routed by role
 *
 * Required Supabase config:
 * - Auth → Providers → Apple → ENABLED
 * - Service ID (client ID) for web (e.g. com.elevio.app.web)
 * - Team ID, Key ID, private key for server-side verification
 *
 * Required Apple Developer config:
 * - App ID with "Sign in with Apple" capability
 * - Sign in with Apple capability in Xcode project
 * - Service ID for web (if using Apple JS SDK fallback)
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileForUser } from "@/lib/profile";
import { getSubscriptionStatus } from "@/lib/billing/planGuards";

async function appOrigin() {
  const headerStore = await headers();
  return headerStore.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Sign in with Apple using the identityToken from the native/JS SDK.
 *
 * Called from the client after Capacitor's authorize() succeeds.
 * The identityToken is a JWT that Supabase verifies server-side.
 */
export async function signInWithApple(identityToken: string, fullName?: { firstName?: string | null; familyName?: string | null }) {
  if (!identityToken) {
    return { ok: false as const, message: "Jeton Apple manquant. Réessayez.", provider: "apple" as const };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ok: false as const, message: "Service indisponible.", provider: "apple" as const };
  }

  // Supabase verifies the Apple id_token and creates/finds the user
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
  });

  if (error) {
    return { ok: false as const, message: `Erreur Apple : ${error.message}`, provider: "apple" as const };
  }

  if (data.user) {
    await ensureProfileForUser(supabase, data.user);

    // Apple only shares the user's name on first sign-in.
    // If we have it from the native response, update the profile now.
    if (fullName?.firstName || fullName?.familyName) {
      const updates: Record<string, string> = {};
      if (fullName.firstName) updates.first_name = fullName.firstName;
      if (fullName.familyName) updates.last_name = fullName.familyName;
      if (Object.keys(updates).length > 0) {
        await supabase.from("profiles").update(updates).eq("id", data.user.id);
      }
    }
  }

  // Determine if user is new (no profile yet) or existing
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_role, first_name")
    .eq("id", data.user?.id ?? "")
    .maybeSingle();

  const isNewUser = !profile?.first_name;

  if (isNewUser) {
    redirect("/onboarding");
  }

  // Route based on role — check subscription first for non-superadmins
  const role = profile?.account_role;
  if (role !== "superadmin") {
    const { hasActiveSubscription } = await getSubscriptionStatus(data.user?.id ?? "");
    if (!hasActiveSubscription) {
      redirect("/paywall");
    }
  }
  if (role === "operator") {
    redirect("/operator");
  }
  redirect("/admin/projects");
}

/**
 * Sign in with email + password (mobile-optimized).
 * Redirects to /onboarding if no profile, otherwise to role-based destination.
 */
export async function signInMobile(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: "Service indisponible." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Courriel et mot de passe obligatoires." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }

  if (data.user) {
    await ensureProfileForUser(supabase, data.user);
  }

  // Route based on role
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_role")
    .eq("id", data.user?.id ?? "")
    .maybeSingle();

  const role = profile?.account_role;

  // Superadmins always get direct access
  if (role === "superadmin") {
    redirect("/superadmin");
  }

  // Other roles: check subscription before routing to protected pages
  const { hasActiveSubscription } = await getSubscriptionStatus(data.user?.id ?? "");
  if (!hasActiveSubscription) {
    redirect("/paywall");
  }

  if (role === "operator") {
    redirect("/operator");
  }
  redirect("/admin/projects");
}

/**
 * Mobile signup with onboarding data.
 * Creates account + profile in one step.
 */
export async function signUpMobile(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: "Service indisponible." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const role = String(formData.get("role") ?? "operator");
  const planId = String(formData.get("planId") ?? "free");

  if (!email || password.length < 6) {
    return { ok: false, message: "Courriel et mot de passe (6+ caractères) obligatoires." };
  }
  if (!firstName || !lastName) {
    return { ok: false, message: "Prénom et nom obligatoires." };
  }

  const origin = await appOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/onboarding?step=confirm")}`,
      data: {
        first_name: firstName,
        last_name: lastName,
        company,
        phone,
        account_role: role,
        selected_plan: planId,
      },
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (data.session && data.user) {
    await ensureProfileForUser(supabase, data.user);
    // New users need a subscription before accessing operator/admin.
    // Redirect to paywall so they can subscribe first.
    redirect("/paywall");
  }

  return {
    ok: true,
    message: "Compte créé. Vérifiez votre courriel pour confirmer votre accès.",
  };
}
