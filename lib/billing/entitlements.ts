/**
 * Entitlements and plan limit checks.
 *
 * These functions determine what a user/workspace can do
 * based on their current plan. They are designed to be
 * called at decision points without breaking existing flows.
 *
 * Integration TODO: Wire these into project creation, operator
 * activation, and analytics pages once the user/workspace
 * abstraction is finalized.
 */

import { PLANS, type PlanId, type PlanLimit } from "./plans";

export interface UserEntitlement {
  userId: string;
  planId: PlanId;
  activatedVia: "default" | "iap" | "activation_code" | "admin";
  expiresAt: string | null;
}

/** Get the current plan limits for a given plan ID */
export function getPlanLimits(planId: PlanId): PlanLimit {
  return PLANS[planId].limits;
}

/** Check if a user can create a new project */
export function canCreateProject(planId: PlanId, currentProjectCount: number): boolean {
  const limits = PLANS[planId].limits;
  if (limits.maxProjects === null) return true; // unlimited
  return currentProjectCount < limits.maxProjects;
}

/** Check if a user can add another operator */
export function canAddOperator(planId: PlanId, currentOperatorCount: number): boolean {
  const limits = PLANS[planId].limits;
  if (limits.maxOperators === null) return true; // unlimited
  return currentOperatorCount < limits.maxOperators;
}

/** Check if the plan is Enterprise */
export function isEnterprise(planId: PlanId): boolean {
  return planId === "enterprise";
}

/** Check if the plan is Business or Enterprise */
export function isBusinessOrAbove(planId: PlanId): boolean {
  return planId === "business" || planId === "enterprise";
}

/** Check if the plan has advanced analytics */
export function hasAdvancedAnalytics(planId: PlanId): boolean {
  return PLANS[planId].limits.analytics === "advanced";
}

/** Check if the plan supports multi-operator */
export function supportsMultiOperator(planId: PlanId): boolean {
  return PLANS[planId].limits.multiOperator;
}

/** Get the effective max projects (null = unlimited, displayed as "∞") */
export function effectiveMaxProjects(planId: PlanId): number | null {
  return PLANS[planId].limits.maxProjects;
}

/** Get the effective max operators (null = unlimited, displayed as "∞") */
export function effectiveMaxOperators(planId: PlanId): number | null {
  return PLANS[planId].limits.maxOperators;
}

/**
 * Fetch the current entitlement for a user from Supabase.
 * Returns "free" as default if no entitlement row exists.
 */
export async function getCurrentPlanId(userId: string): Promise<PlanId> {
  // Dynamic import to avoid breaking Node test runner
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    if (!supabase) return "free";

    const { data } = await supabase
      .from("user_entitlements")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();

    return (data?.plan as PlanId) ?? "free";
  } catch {
    return "free";
  }
}
