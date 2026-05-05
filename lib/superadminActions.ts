"use server";

import { createClient } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/billing/plans";

/** Change a user's plan */
export async function changeUserPlan(userId: string, newPlan: PlanId) {
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
