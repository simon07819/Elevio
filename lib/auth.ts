import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileForUser, type AccountRole, type Profile } from "@/lib/profile";

const OPERATOR_ROLES: AccountRole[] = ["operator", "admin", "superadmin"];
const ADMIN_ROLES: AccountRole[] = ["admin", "superadmin"];

export async function getCurrentUser() {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/admin/login");
  }

  return user;
}

/** Operator guard: requires authentication + operator/admin/superadmin role. */
export async function requireOperator() {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  if (!profile || !OPERATOR_ROLES.includes(profile.account_role)) {
    redirect("/admin/login");
  }

  return { user, profile };
}

/** Admin guard: requires authentication + admin/superadmin role. */
export async function requireAdmin() {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  if (!profile || !ADMIN_ROLES.includes(profile.account_role)) {
    redirect("/admin/login");
  }

  return { user, profile };
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  await ensureProfileForUser(supabase, user);

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile | null) ?? null;
}

export async function requireSuperadmin() {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  if (profile?.account_role !== "superadmin") {
    return { user, profile: null };
  }

  return { user, profile };
}
