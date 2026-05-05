import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/profile";
import type { Project } from "@/types/hoist";
import { effectivePlanId, type PlanId } from "@/lib/billing/plans";
import { isStripeConfigured, getStripeSubscriptions, getStripePayments, type StripeSubscription, type StripePayment } from "@/lib/billing/stripe";

export type SuperadminData = {
  profiles: Profile[];
  projects: Project[];
};

export type DashboardData = {
  newAccounts7d: number;
  activeAccounts: number;
  activeProjects: number;
  activeOperators: number;
  requestsToday: number;
  estimatedMonthlyRevenue: number;
  plansSold: string;
  recentErrors24h: number;
  recentErrors: Array<{ message?: string; error?: string; created_at?: string }>;
  planDistribution: Array<{ plan: string; count: number }>;
};

export async function getSuperadminData(): Promise<SuperadminData> {
  const supabase = await createClient();

  if (!supabase) {
    return { profiles: [], projects: [] };
  }

  const [{ data: profiles }, { data: projects }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,first_name,last_name,company,phone,account_role,created_at,updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,service_timezone,priorities_enabled")
      .order("created_at", { ascending: false }),
  ]);

  return {
    profiles: (profiles ?? []) as Profile[],
    projects: (projects ?? []) as Project[],
  };
}

export async function getSuperadminDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      newAccounts7d: 0, activeAccounts: 0, activeProjects: 0,
      activeOperators: 0, requestsToday: 0, estimatedMonthlyRevenue: 0,
      plansSold: "—", recentErrors24h: 0, recentErrors: [], planDistribution: [],
    };
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterday24h = new Date(now.getTime() - 86_400_000).toISOString();

  // Run all queries in parallel
  const [
    { count: newAccounts7d },
    { count: activeAccounts },
    { count: activeProjects },
    { data: activeElevators },
    { count: requestsToday },
    { data: entitlements },
    { data: recentErrors },
  ] = await Promise.all([
    // New accounts in the last 7 days
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    // Total accounts with a last sign-in or created recently
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    // Active projects
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("active", true),
    // Active operators (elevators with active session)
    supabase.from("elevators").select("id").eq("operator_active", true),
    // Requests created today
    supabase.from("action_requests").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
    // Plan distribution
    supabase.from("user_entitlements").select("plan"),
    // Recent errors from structured log buffer or a dedicated table
    supabase.from("app_errors").select("message,error,created_at").gte("created_at", yesterday24h).order("created_at", { ascending: false }).limit(20),
  ]);

  // Calculate plan distribution
  const planCounts: Record<string, number> = {};
  for (const row of entitlements ?? []) {
    const plan = effectivePlanId((row.plan as PlanId) ?? "starter");
    planCounts[plan] = (planCounts[plan] ?? 0) + 1;
  }
  const planDistribution = Object.entries(planCounts)
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count);

  // Estimated monthly revenue (Starter: $199, Pro: $499, Enterprise: $999)
  const starterCount = planCounts["starter"] ?? 0;
  const proCount = planCounts["pro"] ?? 0;
  const enterpriseCount = planCounts["enterprise"] ?? 0;
  const estimatedMonthlyRevenue = starterCount * 199 + proCount * 499 + enterpriseCount * 999;

  // Plans sold string
  const plansParts: string[] = [];
  if (starterCount) plansParts.push(`Starter: ${starterCount}`);
  if (proCount) plansParts.push(`Pro: ${proCount}`);
  if (enterpriseCount) plansParts.push(`Enterprise: ${enterpriseCount}`);
  const plansSold = plansParts.length > 0 ? plansParts.join(", ") : "—";

  return {
    newAccounts7d: newAccounts7d ?? 0,
    activeAccounts: activeAccounts ?? 0,
    activeProjects: activeProjects ?? 0,
    activeOperators: activeElevators?.length ?? 0,
    requestsToday: requestsToday ?? 0,
    estimatedMonthlyRevenue,
    plansSold,
    recentErrors24h: recentErrors?.length ?? 0,
    recentErrors: (recentErrors ?? []) as Array<{ message?: string; error?: string; created_at?: string }>,
    planDistribution,
  };
}

/** Get all users with their entitlement info */
export async function getSuperadminUsers() {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email,first_name,last_name,company,phone,account_role,created_at,suspended")
    .order("created_at", { ascending: false });

  const { data: entitlements } = await supabase
    .from("user_entitlements")
    .select("user_id,plan,activated_via,expires_at");

  const entitlementMap = new Map((entitlements ?? []).map((e) => [e.user_id, e]));

  return (profiles ?? []).map((p) => ({
    ...p,
    plan: (entitlementMap.get(p.id)?.plan ?? "starter") as string,
    activatedVia: entitlementMap.get(p.id)?.activated_via ?? "default",
    expiresAt: entitlementMap.get(p.id)?.expires_at ?? null,
  }));
}

/** Get all projects with owner info */
export async function getSuperadminProjects() {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("projects")
    .select("id,name,address,active,owner_id,created_at")
    .order("created_at", { ascending: false });

  return data ?? [];
}

/** Get billing records — real Stripe data when configured, DB subscriptions otherwise */
export async function getSuperadminBilling() {
  const supabase = await createClient();
  if (!supabase) return { subscriptions: [], payments: [], source: "entitlements" as const };

  // Always fetch from subscriptions table (authoritative source)
  const { data: dbSubs } = await supabase
    .from("subscriptions")
    .select("user_id,provider,provider_subscription_id,plan_id,billing_period,status,current_period_start,current_period_end,cancel_at_period_end,price_id,created_at,updated_at")
    .order("created_at", { ascending: false });

  // Get profile emails for each user
  const userIds = [...new Set((dbSubs ?? []).map((s) => s.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email")
    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const emailMap = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  const subscriptions = (dbSubs ?? []).map((s) => ({
    userId: s.user_id,
    email: emailMap.get(s.user_id) ?? "",
    plan: s.plan_id,
    activatedVia: s.provider,
    startDate: s.current_period_start ?? s.created_at,
    expiresAt: s.current_period_end ?? null,
    status: s.status,
    provider: s.provider === "stripe" ? "Stripe" : s.provider === "revenuecat" ? "Apple" : s.provider === "activation_code" ? "Code" : s.provider,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    priceId: s.price_id,
    billingPeriod: s.billing_period,
  }));

  // If Stripe is configured, also fetch recent payments
  if (isStripeConfigured()) {
    const stripePayments = await getStripePayments();
    const payments = stripePayments.map((p: StripePayment) => ({
      date: p.created,
      amount: `${p.amount.toFixed(2)} ${p.currency}`,
      plan: p.plan,
      status: p.status === "paid" ? "paid" : String(p.status),
    }));
    return { subscriptions, payments, source: "stripe" as const };
  }

  // Fallback: also include entitlement-only users (no subscription row)
  const { data: entitlements } = await supabase
    .from("user_entitlements")
    .select("user_id,plan,activated_via,created_at,expires_at")
    .order("created_at", { ascending: false });

  const subUserIds = new Set((dbSubs ?? []).map((s) => s.user_id));
  const entitlementOnlySubs = (entitlements ?? [])
    .filter((e) => !subUserIds.has(e.user_id))
    .map((e) => ({
      userId: e.user_id,
      email: emailMap.get(e.user_id) ?? "",
      plan: e.plan,
      activatedVia: e.activated_via,
      startDate: e.created_at,
      expiresAt: e.expires_at ?? null,
      status: "active" as string,
      provider: e.activated_via === "iap" ? "Apple" as string : e.activated_via === "activation_code" ? "Code" as string : "—" as string,
      cancelAtPeriodEnd: false,
      priceId: null as string | null,
      billingPeriod: "monthly" as string,
    }));

  return {
    subscriptions: [...subscriptions, ...entitlementOnlySubs],
    payments: [] as Array<Record<string, unknown>>,
    source: "entitlements" as const,
  };
}
