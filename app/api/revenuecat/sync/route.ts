import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAppError } from "@/lib/appErrors";
import { resolveProductId } from "@/lib/billing/productIds";

/**
 * POST /api/revenuecat/sync
 *
 * Explicit client -> server sync after RevenueCat purchase.
 * This is called after a successful IAP purchase to ensure
 * the Supabase entitlement is updated server-side (not just client-side).
 *
 * Body:
 *   appUserId: string       (Supabase user ID)
 *   entitlement: string     ("starter" | "pro" | "enterprise")
 *   productId: string       (App Store product ID)
 *   source: string          ("revenuecat" | "app_store")
 *   expiresAt: string|null  (ISO date from RevenueCat)
 *   billingPeriod: string   ("monthly" | "annual")
 */

const REVENUECAT_AUTH_TOKEN = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN ?? "";

interface SyncRequest {
  appUserId: string;
  entitlement: string;
  productId: string;
  source: string;
  expiresAt?: string | null;
  billingPeriod?: string;
}

export async function POST(req: NextRequest) {
  // Auth: require either the webhook token OR a valid Supabase session
  const authHeader = req.headers.get("authorization");
  const hasBearerAuth = authHeader === `Bearer ${REVENUECAT_AUTH_TOKEN}`;

  let userId: string | null = null;

  if (!hasBearerAuth) {
    // Fallback: validate via Supabase session
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Auth required" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Auth required" }, { status: 401 });
    }
    userId = user.id;
  }

  let body: SyncRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const effectiveUserId = userId ?? body.appUserId;
  if (!effectiveUserId) {
    return NextResponse.json({ error: "Missing appUserId" }, { status: 400 });
  }

  // Security: session users can only sync their own appUserId
  if (!hasBearerAuth && userId && body.appUserId && body.appUserId !== userId) {
    return NextResponse.json({ error: "Forbidden: appUserId mismatch" }, { status: 403 });
  }

  const { entitlement, productId, source, expiresAt, billingPeriod } = body;

  // Resolve productId to plan info (supports both current and legacy formats)
  const planInfo = resolveProductId(productId);
  const planId = (entitlement as "starter" | "pro" | "enterprise") ?? planInfo?.planId ?? "starter";
  const effectiveBillingPeriod = billingPeriod ?? planInfo?.period ?? "monthly";

  // Validate entitlement value
  const validPlans = new Set(["starter", "pro", "business", "enterprise"]);
  if (!validPlans.has(planId)) {
    return NextResponse.json({ error: "Invalid entitlement" }, { status: 400 });
  }

  // Validate source
  const validSources = new Set(["revenuecat", "app_store", "iap"]);
  if (!validSources.has(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  console.log("[RevenueCat sync] user:", effectiveUserId, "plan:", planId, "product:", productId, "source:", source);

  // 1. Upsert subscription row
  const { error: subError } = await supabase.from("subscriptions").upsert({
    user_id: effectiveUserId,
    provider: "revenuecat",
    provider_subscription_id: `${effectiveUserId}:${productId}`,
    provider_customer_id: effectiveUserId,
    plan_id: planId,
    billing_period: effectiveBillingPeriod,
    status: "active",
    current_period_end: expiresAt ?? null,
    price_id: productId,
  }, { onConflict: "user_id,provider,provider_subscription_id" });

  if (subError) {
    void logAppError({ message: "RevenueCat sync subscription upsert failed", error: subError.message, category: "billing", level: "error" });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  // 2. Upsert entitlement
  const { error: entError } = await supabase.from("user_entitlements").upsert({
    user_id: effectiveUserId,
    plan: planId,
    activated_via: "iap",
    expires_at: expiresAt ?? null,
  }, { onConflict: "user_id" });

  if (entError) {
    void logAppError({ message: "RevenueCat sync entitlement upsert failed", error: entError.message, category: "billing", level: "error" });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  console.log("[RevenueCat sync] success:", effectiveUserId, "->", planId);

  return NextResponse.json({
    ok: true,
    userId: effectiveUserId,
    planId,
    expiresAt: expiresAt ?? null,
  });
}
