/**
 * Central permissions module.
 *
 * Single source of truth for what a user can do based on their plan.
 * Used both client-side (UI gating) and server-side (API enforcement).
 *
 * Rules:
 * - Free: can log in, view dashboard, see upgrade CTA, access legal/support.
 *   CANNOT create projects, create jobsites, activate operators, use dispatch, use QR project.
 * - Starter+: all free features + 1 project, 2 operators, QR project.
 * - Pro+: multi-project, advanced analytics.
 * - Enterprise: unlimited, custom support.
 */

import type { PlanId } from "@/lib/billing/plans";
import { PLANS, effectivePlanId } from "@/lib/billing/plans";

/** Whether the plan allows any paid feature (project creation, dispatch, etc.) */
export function isPaidPlan(planId: PlanId): boolean {
  return effectivePlanId(planId) !== "starter" || planId !== "free";
}

/** Whether the user can create a project */
export function canCreateProject(planId: PlanId): boolean {
  // Free plan: CANNOT create projects
  if (planId === "free") return false;
  return true;
}

/** Whether the user can create a jobsite (same as project for now) */
export function canCreateJobsite(planId: PlanId): boolean {
  if (planId === "free") return false;
  return true;
}

/** Whether the user can use the real-time dispatch */
export function canUseDispatch(planId: PlanId): boolean {
  if (planId === "free") return false;
  return true;
}

/** Whether the user can activate operators */
export function canActivateOperators(planId: PlanId): boolean {
  if (planId === "free") return false;
  return true;
}

/** Whether the user can use active QR project (passenger QR always works) */
export function canUseQrProject(planId: PlanId): boolean {
  if (planId === "free") return false;
  return true;
}

/** Whether the user can access advanced analytics */
export function canAccessAdvancedAnalytics(planId: PlanId): boolean {
  const effective = effectivePlanId(planId);
  return effective === "pro" || effective === "business" || effective === "enterprise";
}

/** Whether the user can access billing/subscription management */
export function canAccessBilling(planId: PlanId): boolean {
  // Even free users should see billing to upgrade
  return true;
}

/** Whether the user can use the admin/owner dashboard fully */
export function canUseAdminDashboard(planId: PlanId): boolean {
  if (planId === "free") return false;
  return true;
}

/** Whether the user can access project configuration */
export function canConfigureProject(planId: PlanId): boolean {
  if (planId === "free") return false;
  return true;
}

/**
 * Check project count limit for a plan.
 * Returns true if the user can create another project.
 */
export function canCreateAnotherProject(planId: PlanId, currentCount: number): boolean {
  if (planId === "free") return false;
  const limits = PLANS[effectivePlanId(planId)].limits;
  if (limits.maxProjects === null) return true;
  return currentCount < limits.maxProjects;
}

/**
 * Check operator count limit for a plan.
 * Returns true if the user can add another operator.
 */
export function canAddAnotherOperator(planId: PlanId, currentCount: number): boolean {
  if (planId === "free") return false;
  const limits = PLANS[effectivePlanId(planId)].limits;
  if (limits.maxOperators === null) return true;
  return currentCount < limits.maxOperators;
}

/** Get a human-readable description of what the free plan restricts */
export function getFreePlanRestrictions(): string[] {
  return [
    "Création de projets/chantiers",
    "Activation d'opérateurs",
    "Dispatch en temps réel",
    "Configuration QR projet",
    "Analytics avancés",
    "Configuration avancée",
  ];
}

/** Get the plan label for display */
export function getPlanLabel(planId: PlanId): string {
  return PLANS[planId]?.label ?? "Gratuit";
}
