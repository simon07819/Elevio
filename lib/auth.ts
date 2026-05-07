import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileForUser, type AccountRole, type Profile } from "@/lib/profile";
import { enforcePaymentStatus, getSubscriptionStatus } from "@/lib/billing/planGuards";
import type { PlanId } from "@/lib/billing/plans";

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

/** Operator guard: requires auth + operator/admin/superadmin role + active subscription. */
export async function requireOperator() {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  if (!profile || !OPERATOR_ROLES.includes(profile.account_role)) {
    redirect("/admin/login");
  }

  // Enforce active subscription — redirect to paywall if no active subscription.
  // Superadmins bypass this check (admin-granted access).
  if (profile.account_role !== "superadmin") {
    const paymentGuard = await enforcePaymentStatus(user.id);
    if (!paymentGuard.ok) {
      redirect("/paywall");
    }
  }

  return { user, profile };
}

/** Admin guard: requires auth + admin/superadmin role + active subscription. */
export async function requireAdmin() {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  if (!profile || !ADMIN_ROLES.includes(profile.account_role)) {
    redirect("/admin/login");
  }

  // Enforce active subscription — redirect to paywall if no active subscription.
  // Superadmins bypass this check (admin-granted access).
  if (profile.account_role !== "superadmin") {
    const paymentGuard = await enforcePaymentStatus(user.id);
    if (!paymentGuard.ok) {
      redirect("/paywall");
    }
  }

  return { user, profile };
}

/**
 * Soft admin guard: allows free-plan users to access the dashboard.
 * Returns plan info so UI can show upgrade CTA for free users.
 * Free users can see their dashboard, profile, support, legal.
 * Free users CANNOT access project/operator/dispatch pages (still redirects to paywall).
 */
export async function requireAdminWithPlan() {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  if (!profile || !ADMIN_ROLES.includes(profile.account_role)) {
    redirect("/admin/login");
  }

  const subStatus = await getSubscriptionStatus(user.id);
  const isFree = !subStatus.hasActiveSubscription;
  const planId = subStatus.planId;

  return { user, profile, isFree, planId };
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

/** Legacy alias — prefer requireSuperAdmin() from lib/auth/superadmin */
export async function requireSuperadmin() {
  const { requireSuperAdmin } = await import("@/lib/auth/superadmin");
  return requireSuperAdmin();
}
