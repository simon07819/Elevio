/**
 * Server-side plan limit enforcement.
 *
 * These functions fetch the user's plan from user_entitlements
 * and check against the plan limits BEFORE allowing actions.
 * They return { ok, message } to be used as guards in server actions.
 *
 * Usage:
 *   const guard = await enforceProjectLimit(userId);
 *   if (!guard.ok) return guard;
 */

import { PLANS, effectivePlanId, type PlanId, type PlanLimit } from "./plans";
import { createClient } from "@/lib/supabase/server";

/** Get the plan ID for a user from user_entitlements. Defaults to "starter". */
export async function getPlanForUser(userId: string): Promise<PlanId> {
  const supabase = await createClient();
  if (!supabase) return "starter";

  const { data } = await supabase
    .from("user_entitlements")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  const raw = (data?.plan as PlanId) ?? "starter";
  return effectivePlanId(raw);
}

/** Count non-archived projects for a user */
async function countProjects(userId: string): Promise<number> {
  const supabase = await createClient();
  if (!supabase) return 0;

  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .is("archived_at", null);

  return count ?? 0;
}

/** Count live operators across all elevators in a project */
async function countLiveOperators(projectId: string): Promise<number> {
  const supabase = await createClient();
  if (!supabase) return 0;

  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 min
  const now = new Date();

  const { data: elevators } = await supabase
    .from("elevators")
    .select("operator_session_id, operator_session_heartbeat_at")
    .eq("project_id", projectId)
    .eq("active", true);

  if (!elevators) return 0;

  return elevators.filter((e: { operator_session_id: string | null; operator_session_heartbeat_at: string | null }) =>
    Boolean(e.operator_session_id) &&
    e.operator_session_heartbeat_at != null &&
    (now.getTime() - new Date(e.operator_session_heartbeat_at).getTime()) < STALE_THRESHOLD_MS,
  ).length;
}

/** Count requests created today for a project */
async function countTodayRequests(projectId: string): Promise<number> {
  const supabase = await createClient();
  if (!supabase) return 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("created_at", todayStart.toISOString());

  return count ?? 0;
}

type GuardResult = { ok: true; planId: PlanId } | { ok: false; message: string; planId: PlanId };

/** Enforce project creation limit */
export async function enforceProjectLimit(userId: string): Promise<GuardResult> {
  const planId = await getPlanForUser(userId);
  const limits = PLANS[planId].limits;

  if (limits.maxProjects === null) {
    return { ok: true, planId };
  }

  const current = await countProjects(userId);
  if (current >= limits.maxProjects) {
    return {
      ok: false,
      planId,
      message: `Limite atteinte : ${limits.maxProjects} chantier${limits.maxProjects > 1 ? "s" : ""} sur le forfait ${PLANS[planId].label}. Passez à un forfait supérieur pour créer plus de chantiers.`,
    };
  }

  return { ok: true, planId };
}

/** Enforce operator activation limit */
export async function enforceOperatorLimit(projectId: string): Promise<GuardResult> {
  // Operators are per-project, but we check the project owner's plan
  const supabase = await createClient();
  if (!supabase) return { ok: true, planId: "free" };

  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();

  const ownerId = project?.owner_id;
  if (!ownerId) return { ok: true, planId: "free" };

  const planId = await getPlanForUser(ownerId);
  const limits = PLANS[planId].limits;

  if (limits.maxOperators === null) {
    return { ok: true, planId };
  }

  const current = await countLiveOperators(projectId);
  if (current >= limits.maxOperators) {
    return {
      ok: false,
      planId,
      message: `Limite atteinte : ${limits.maxOperators} opérateur${limits.maxOperators > 1 ? "s" : ""} actif${limits.maxOperators > 1 ? "s" : ""} sur le forfait ${PLANS[planId].label}. Passez à Pro pour plus d'opérateurs.`,
    };
  }

  return { ok: true, planId };
}

/** Enforce daily request limit */
export async function enforceRequestLimit(projectId: string): Promise<GuardResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: true, planId: "free" };

  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();

  const ownerId = project?.owner_id;
  if (!ownerId) return { ok: true, planId: "free" };

  const planId = await getPlanForUser(ownerId);
  const limits = PLANS[planId].limits;

  if (limits.maxRequestsPerDay === null) {
    return { ok: true, planId };
  }

  const current = await countTodayRequests(projectId);
  if (current >= limits.maxRequestsPerDay) {
    return {
      ok: false,
      planId,
      message: `Limite quotidienne atteinte : ${limits.maxRequestsPerDay} demandes/jour sur le forfait ${PLANS[planId].label}. Passez à Starter pour des demandes illimitées.`,
    };
  }

  return { ok: true, planId };
}
