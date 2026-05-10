/**
 * Server-side plan limit enforcement + payment status checks.
 *
 * These functions fetch the user's plan from user_entitlements
 * and check against the plan limits BEFORE allowing actions.
 * They also verify that the user has an active subscription
 * (not past_due, expired, or canceled).
 *
 * Usage:
 *   const guard = await enforceProjectLimit(userId);
 *   if (!guard.ok) return guard;
 */

import { PLANS, effectivePlanId, type PlanId, type PlanLimit } from "./plans";
import { createClient } from "@/lib/supabase/server";

/** Subscription statuses that block access */
const BLOCKING_STATUSES = new Set(["past_due", "expired", "canceled", "incomplete"]);

/** Check if the user has an active subscription (or no subscription needed) */
export async function getSubscriptionStatus(userId: string): Promise<{
  hasActiveSubscription: boolean;
  status: string | null;
  provider: string | null;
  planId: PlanId;
}> {
  const supabase = await createClient();

  if (!supabase) {
    // Fail CLOSED: if Supabase is unreachable, deny access rather than grant it
    return { hasActiveSubscription: false, status: "error", provider: null, planId: "free" };
  }

  // Get the entitlement plan + expiration
  const { data: entitlement } = await supabase
    .from("user_entitlements")
    .select("plan, activated_via, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  const rawPlan = (entitlement?.plan as PlanId) ?? "free";
  const planId = effectivePlanId(rawPlan);
  const activatedVia = entitlement?.activated_via ?? "default";

  // Any plan with "default" activation and no paid source = no active subscription.
  // This covers:
  //   - plan:"free" + default = genuinely free
  //   - plan:"starter" + default = downgraded IAP user or self-selected during onboarding
  //   - plan:"pro"/"enterprise" + default = self-selected during onboarding, not yet paid
  // Only admin/activation_code/manual/manual_code bypass the subscription check.
  if (activatedVia === "default") {
    return { hasActiveSubscription: false, status: "free", provider: null, planId: "free" };
  }

  // Admin/activation_code/manual/manual_code activated users don't need an
  // active subscription row — the activated_via itself proves access was granted.
  // However, we must verify the activation is legitimate:
  //   - "activation_code" = verified via activation_codes table
  //   - "admin" = granted by superadmin, but only for non-starter plans.
  //     Starter+admin is a legacy artifact from the onboarding bug where
  //     self-selected plans during signup incorrectly used activated_via:"admin".
  //     These users must have an active subscription to prove they paid.
  //   - "manual"/"manual_code" = granted with expiration, checked below
  if (activatedVia === "activation_code") {
    return { hasActiveSubscription: true, status: "active", provider: activatedVia, planId };
  }

  // Legacy guard: plan:"starter"/"free" + activated_via:"admin" = likely from
  // the old onboarding bug where self-selected plans got activated_via:"admin".
  // These users must prove payment via an active subscription row.
  // A genuine superadmin grant for a paid plan (pro/enterprise) is still trusted.
  if (activatedVia === "admin") {
    const isPaidPlan = rawPlan !== "free" && rawPlan !== "starter";
    if (isPaidPlan) {
      return { hasActiveSubscription: true, status: "active", provider: activatedVia, planId };
    }
    // starter/free + admin → fall through to subscription table check
  }

  if (activatedVia === "manual" || activatedVia === "manual_code") {
    // For manual/manual_code plans, check expiration
    if (entitlement?.expires_at) {
      const expiresAt = new Date(entitlement.expires_at);
      if (expiresAt < new Date()) {
        return { hasActiveSubscription: false, status: "expired", provider: "manual", planId: "starter" };
      }
    }
    return { hasActiveSubscription: true, status: "active", provider: activatedVia, planId };
  }

  // Check if entitlement has expired (server-side expiration guard)
  if (entitlement?.expires_at) {
    const expiresAt = new Date(entitlement.expires_at);
    if (expiresAt < new Date() && activatedVia === "iap") {
      // IAP entitlement expired — treat as no subscription
      return { hasActiveSubscription: false, status: "expired", provider: "revenuecat", planId: "starter" };
    }
  }

  // Check for any active subscription
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("status, provider")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!subs || subs.length === 0) {
    // No subscription row — user is on free plan unless legitimately activated
    // activation_code/manual/manual_code are verified grant sources.
    // "admin" for paid plans (pro/enterprise) is already handled above.
    // "admin" for starter/free falls through here = legacy bug, no access.
    if (activatedVia === "activation_code" || activatedVia === "manual" || activatedVia === "manual_code") {
      return { hasActiveSubscription: true, status: "active", provider: activatedVia, planId };
    }
    // No subscription + no verified activation = free user
    return { hasActiveSubscription: false, status: "free", provider: null, planId: "free" };
  }

  // Check if ANY subscription is active
  // Cross-reference with entitlement: if activatedVia is "default" (no paid source),
  // stale revenuecat subscription rows should NOT grant access
  const activeSub = subs.find((s) => {
    if (s.status !== "active" && s.status !== "trialing") return false;
    // Stale guard: default-activated entitlement + revenuecat sub = lapsed, don't trust
    if (activatedVia === "default" && s.provider === "revenuecat") return false;
    return true;
  });
  const blockingSub = subs.find((s) => BLOCKING_STATUSES.has(s.status));

  if (activeSub) {
    return {
      hasActiveSubscription: true,
      status: activeSub.status,
      provider: activeSub.provider,
      planId,
    };
  }

  if (blockingSub) {
    return {
      hasActiveSubscription: false,
      status: blockingSub.status,
      provider: blockingSub.provider,
      planId,
    };
  }

  // No active, no blocking — probably paused or unknown
  return { hasActiveSubscription: false, status: subs[0]?.status ?? "unknown", provider: subs[0]?.provider ?? null, planId };
}

/** Get the plan ID for a user from user_entitlements. Defaults to "starter". */
export async function getPlanForUser(userId: string): Promise<PlanId> {
  const supabase = await createClient();
  if (!supabase) return "starter";

  const { data } = await supabase
    .from("user_entitlements")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  const raw = (data?.plan as PlanId) ?? "free";
  return raw;
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

/** Enforce payment status — block access if subscription is past_due/expired */
export async function enforcePaymentStatus(userId: string): Promise<GuardResult> {
  const { hasActiveSubscription, status, planId } = await getSubscriptionStatus(userId);

  if (hasActiveSubscription) {
    return { ok: true, planId };
  }

  const statusMessages: Record<string, string> = {
    free: "Forfait gratuit — fonctionnalités limitées. Passez à un forfait payant pour débloquer le dispatch et la création de projets.",
    past_due: "Paiement en retard. Mettez à jour votre méthode de paiement pour continuer.",
    expired: "Abonnement expiré. Renouvelez votre forfait pour continuer.",
    canceled: "Abonnement annulé. Réactivez votre forfait pour continuer.",
    incomplete: "Paiement incomplet. Complétez votre achat pour continuer.",
  };

  return {
    ok: false,
    planId,
    message: statusMessages[status ?? ""] ?? "Aucun abonnement actif. Souscrivez à un forfait pour continuer.",
  };
}

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
