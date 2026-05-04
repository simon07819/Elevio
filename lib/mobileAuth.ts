"use server";

/**
 * Mobile auth abstraction.
 *
 * Provides:
 * - signInWithApple (mock until Capacitor plugin is wired)
 * - signInWithEmail (delegates to Supabase)
 * - signUpMobile (onboarding-aware signup)
 *
 * When the native Apple Sign-In plugin is ready, replace the mock
 * with the Capacitor call that returns an identityToken.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileForUser } from "@/lib/profile";

async function appOrigin() {
  const headerStore = await headers();
  return headerStore.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Sign in with Apple.
 *
 * Currently a MOCK — returns a placeholder result.
 * When Capacitor SignInWithApple plugin is wired:
 * 1. The native side gets the Apple identityToken
 * 2. It posts to this server action with { identityToken, fullName }
 * 3. This function verifies the token via Supabase auth
 *
 * For now, falls back to email+password flow.
 */
export async function signInWithApple(_identityToken?: string, _fullName?: { firstName?: string; lastName?: string }) {
  // TODO: Wire native Apple Sign-In via Capacitor plugin
  // const supabase = await createClient();
  // const { data, error } = await supabase.auth.signInWithIdToken({
  //   provider: "apple",
  //   token: identityToken,
  // });
  // For now, return mock indicating Apple auth is not yet available
  return {
    ok: false,
    message: "Connexion Apple bientôt disponible. Utilisez votre courriel pour l'instant.",
    provider: "apple" as const,
  };
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
    // Auto-confirmed — go to role-based destination
    if (role === "operator") {
      redirect("/operator");
    }
    redirect("/admin/projects?onboarding=1");
  }

  return {
    ok: true,
    message: "Compte créé. Vérifiez votre courriel pour confirmer votre accès.",
  };
}
