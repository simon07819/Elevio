"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { PLANS, effectivePlanId, type PlanId } from "@/lib/billing/plans";
import { logAppError } from "@/lib/appErrors";

/** Change a user's plan (legacy — sets activated_via to "admin") */
export async function changeUserPlan(userId: string, newPlan: PlanId) {
  await requireSuperAdmin();
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { error } = await supabase
    .from("user_entitlements")
    .upsert({ user_id: userId, plan: newPlan, activated_via: "admin" }, { onConflict: "user_id" });

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Plan changé vers ${newPlan}.` };
}

/** Suspend or reactivate a user */
export async function setUserSuspended(userId: string, suspended: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const updates: Record<string, unknown> = { suspended };
  if (suspended) {
    updates.suspended_at = new Date().toISOString();
  } else {
    updates.suspended_reason = null;
    updates.suspended_at = null;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: suspended ? "Compte suspendu." : "Compte réactivé." };
}

/** Resolve an app error */
export async function resolveAppError(errorId: string) {
  await requireSuperAdmin();
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("app_errors")
    .update({
      resolved: true,
      resolved_by: user?.id ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", errorId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Erreur marquée résolue." };
}

/** Clear all app_errors rows — superadmin only, irreversible */
export async function clearAppErrors() {
  await requireSuperAdmin();
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  const { count } = await supabase
    .from("app_errors")
    .select("id", { count: "exact", head: true });

  const { error } = await supabase
    .from("app_errors")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${count ?? 0} logs supprimés.` };
}

/**
 * Attribute a manual plan to a member — superadmin only.
 *
 * - Sets user_entitlements with activated_via='manual', plan, and expires_at
 * - Creates a subscription row with provider='manual', status='active', billing_period='one_time'
 * - If an active App Store / Stripe subscription exists, refuses unless force=true
 * - Logs the action to app_errors (audit trail)
 */
export async function attributeManualPlan(params: {
  userId: string;
  planId: PlanId;
  durationMonths: number;
  note?: string;
  force?: boolean;
}): Promise<{ ok: boolean; message: string }> {
  const { userId, planId, durationMonths, note, force } = params;
  const { user: adminUser } = await requireSuperAdmin();

  if (!userId) return { ok: false, message: "Membre introuvable." };
  if (!planId || !PLANS[planId]) return { ok: false, message: `Forfait invalide: ${planId}` };
  if (!durationMonths || durationMonths < 1) return { ok: false, message: "Durée invalide (minimum 1 mois)." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  // Check for existing active non-manual subscription
  const { data: existingSubs } = await supabase
    .from("subscriptions")
    .select("id, provider, status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"]);

  const activeNonManual = (existingSubs ?? []).find(
    (s) => s.provider !== "manual" && s.provider !== "admin"
  );

  if (activeNonManual && !force) {
    const providerLabel = activeNonManual.provider === "revenuecat" ? "App Store" :
      activeNonManual.provider === "stripe" ? "Stripe" : activeNonManual.provider;
    return {
      ok: false,
      message: `Ce membre a un abonnement ${providerLabel} actif. Forcer l'attribution écrasera cet abonnement. Cochez "Forcer" pour confirmer.`,
    };
  }

  // Calculate expires_at
  const now = new Date();
  const expiresAt = new Date(now.getFullYear(), now.getMonth() + durationMonths, now.getDate(), now.getHours(), now.getMinutes());

  // Upsert user_entitlements
  const { error: entitlementError } = await supabase
    .from("user_entitlements")
    .upsert({
      user_id: userId,
      plan: planId,
      activated_via: "manual",
      expires_at: expiresAt.toISOString(),
    }, { onConflict: "user_id" });

  if (entitlementError) return { ok: false, message: entitlementError.message };

  // Cancel any existing manual subscriptions for this user
  await supabase
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "manual")
    .eq("status", "active");

  // Insert new manual subscription
  const { error: subError } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      provider: "manual",
      provider_subscription_id: `manual_${userId.slice(0, 8)}_${Date.now()}`,
      plan_id: planId,
      billing_period: "one_time",
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: expiresAt.toISOString(),
      cancel_at_period_end: true,
      metadata: {
        note: note ?? null,
        attributed_by: adminUser.id,
        duration_months: durationMonths,
      },
    });

  if (subError) return { ok: false, message: subError.message };

  // Audit log
  await logAppError({
    message: `Forfait manuel attribué: ${PLANS[effectivePlanId(planId)].label} pour ${durationMonths} mois`,
    category: "billing",
    level: "info",
    userId: adminUser.id,
    metadata: {
      targetUserId: userId,
      planId,
      durationMonths,
      expiresAt: expiresAt.toISOString(),
      note: note ?? null,
      forced: force ?? false,
    },
  });

  return {
    ok: true,
    message: `Forfait ${PLANS[effectivePlanId(planId)].label} attribué pour ${durationMonths} mois. Expire le ${expiresAt.toLocaleDateString("fr-CA")}.`,
  };
}

/**
 * Cancel a manual plan — superadmin only.
 * Reverts the user to starter and marks the subscription as expired.
 */
export async function cancelManualPlan(userId: string): Promise<{ ok: boolean; message: string }> {
  const { user: adminUser } = await requireSuperAdmin();
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: "Service indisponible." };

  // Set entitlement back to starter
  const { error: entitlementError } = await supabase
    .from("user_entitlements")
    .update({ plan: "starter", activated_via: "default", expires_at: null })
    .eq("user_id", userId);

  if (entitlementError) return { ok: false, message: entitlementError.message };

  // Mark manual subscriptions as expired
  await supabase
    .from("subscriptions")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "manual")
    .eq("status", "active");

  // Audit log
  await logAppError({
    message: `Forfait manuel annulé pour le membre`,
    category: "billing",
    level: "info",
    userId: adminUser.id,
    metadata: { targetUserId: userId },
  });

  return { ok: true, message: "Forfait manuel annulé. Le membre est maintenant sur Starter." };
}
