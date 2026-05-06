"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureProfileForUser } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionStatus } from "@/lib/billing/planGuards";

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

function signupProfile(formData: FormData) {
  return {
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim(),
    company: String(formData.get("company") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
  };
}

async function appOrigin() {
  const headerStore = await headers();
  return headerStore.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

export async function signInAdmin(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase n'est pas configure." };
  }

  const { email, password } = credentials(formData);

  if (!email || !password) {
    return { ok: false, message: "Email et mot de passe obligatoires." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (data.user) {
    await ensureProfileForUser(supabase, data.user);
  }

  // Check subscription before routing to protected pages
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_role")
    .eq("id", data.user?.id ?? "")
    .maybeSingle();

  if (profile?.account_role === "superadmin") {
    redirect("/superadmin");
  }

  const { hasActiveSubscription } = await getSubscriptionStatus(data.user?.id ?? "");
  if (!hasActiveSubscription) {
    redirect("/paywall");
  }

  redirect("/admin/projects");
}

export async function signUpAdmin(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase n'est pas configure." };
  }

  const { email, password } = credentials(formData);
  const profile = signupProfile(formData);

  if (!email || password.length < 6) {
    return { ok: false, message: "Le mot de passe doit avoir au moins 6 caracteres." };
  }

  if (!profile.first_name || !profile.last_name || !profile.company || !profile.phone) {
    return { ok: false, message: "Prenom, nom, compagnie et telephone sont obligatoires." };
  }

  const origin = await appOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/admin/profile?onboarding=1")}`,
      data: profile,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (data.session && data.user) {
    await ensureProfileForUser(supabase, data.user);
    // New user needs subscription before accessing admin pages
    redirect("/paywall");
  }

  return {
    ok: true,
    message: "Compte cree. Verifiez votre courriel pour confirmer votre acces.",
  };
}

export async function signOutAdmin() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}

export async function updateCurrentProfile(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase n'est pas configure." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Vous devez etre connecte pour modifier votre profil." };
  }

  const profile = signupProfile(formData);

  if (!profile.first_name || !profile.last_name || !profile.company || !profile.phone) {
    return { ok: false, message: "Prenom, nom, compagnie et telephone sont obligatoires." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(profile)
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  await supabase.auth.updateUser({ data: profile });
  revalidatePath("/admin/profile");
  revalidatePath("/admin");

  return { ok: true, message: "Profil mis a jour." };
}
