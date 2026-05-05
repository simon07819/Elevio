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

import { PLANS, effectivePlanId, type PlanId, type PlanLimit } from "./plans";

export interface UserEntitlement {
  userId: string;
  planId: PlanId;
  activatedVia: "default" | "iap" | "activation_code" | "admin";
  expiresAt: string | null;
}

/** Get the current plan limits for a given plan ID (free → starter) */
export function getPlanLimits(planId: PlanId): PlanLimit {
  return PLANS[effectivePlanId(planId)].limits;
}

/** Check if a user can create a new project (free → starter limits) */
export function canCreateProject(planId: PlanId, currentProjectCount: number): boolean {
  const limits = PLANS[effectivePlanId(planId)].limits;
  if (limits.maxProjects === null) return true;
  return currentProjectCount < limits.maxProjects;
}

/** Check if a user can add another operator (free → starter limits) */
export function canAddOperator(planId: PlanId, currentOperatorCount: number): boolean {
  const limits = PLANS[effectivePlanId(planId)].limits;
  if (limits.maxOperators === null) return true;
  return currentOperatorCount < limits.maxOperators;
}

/** Check if a user can create another request today (free → starter limits) */
export function canCreateRequest(planId: PlanId, todayRequestCount: number): boolean {
  const limits = PLANS[effectivePlanId(planId)].limits;
  if (limits.maxRequestsPerDay === null) return true;
  return todayRequestCount < limits.maxRequestsPerDay;
}

/** Check if the plan is Enterprise */
export function isEnterprise(planId: PlanId): boolean {
  return effectivePlanId(planId) === "enterprise";
}

/** Check if the plan is Business or Enterprise */
export function isBusinessOrAbove(planId: PlanId): boolean {
  const effective = effectivePlanId(planId);
  return effective === "business" || effective === "enterprise";
}

/** Check if the plan has advanced analytics */
export function hasAdvancedAnalytics(planId: PlanId): boolean {
  return PLANS[effectivePlanId(planId)].limits.analytics === "advanced";
}

/** Check if the plan has the premium analytics dashboard */
export function hasAnalyticsDashboard(planId: PlanId): boolean {
  return PLANS[effectivePlanId(planId)].limits.analyticsDashboard;
}

/** Check if the plan shows the efficiency score */
export function hasEfficiencyScore(planId: PlanId): boolean {
  return PLANS[effectivePlanId(planId)].limits.efficiencyScore;
}

/** Check if the plan shows business insight cards */
export function hasBusinessInsights(planId: PlanId): boolean {
  return PLANS[effectivePlanId(planId)].limits.businessInsights;
}

/** Check if the plan shows operator performance section */
export function hasOperatorPerformance(planId: PlanId): boolean {
  return PLANS[effectivePlanId(planId)].limits.operatorPerformance;
}

/** Check if the plan has custom support settings */
export function hasCustomSupport(planId: PlanId): boolean {
  return PLANS[effectivePlanId(planId)].limits.customSupport;
}

/** Check if the plan supports multi-operator */
export function supportsMultiOperator(planId: PlanId): boolean {
  return PLANS[effectivePlanId(planId)].limits.multiOperator;
}

/** Get the effective max projects (null = unlimited) */
export function effectiveMaxProjects(planId: PlanId): number | null {
  return PLANS[effectivePlanId(planId)].limits.maxProjects;
}

/** Get the effective max operators (null = unlimited) */
export function effectiveMaxOperators(planId: PlanId): number | null {
  return PLANS[effectivePlanId(planId)].limits.maxOperators;
}

/** Get the effective max requests per day (null = unlimited) */
export function effectiveMaxRequestsPerDay(planId: PlanId): number | null {
  return PLANS[effectivePlanId(planId)].limits.maxRequestsPerDay;
}

/**
 * Fetch the current entitlement for a user from Supabase.
 * Returns "starter" as default if no entitlement row exists.
 * Legacy "free" is mapped to "starter" via effectivePlanId.
 */
export async function getCurrentPlanId(userId: string): Promise<PlanId> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    if (!supabase) return "starter";

    const { data } = await supabase
      .from("user_entitlements")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();

    const raw = (data?.plan as PlanId) ?? "starter";
    return effectivePlanId(raw);
  } catch {
    return "starter";
  }
}
