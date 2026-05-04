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

  const { error } = await supabase
    .from("profiles")
    .update({ suspended })
    .eq("id", userId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: suspended ? "Compte suspendu." : "Compte réactivé." };
}
