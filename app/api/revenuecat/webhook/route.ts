import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAppError } from "@/lib/appErrors";
import { resolveProductId } from "@/lib/billing/productIds";

/**
 * RevenueCat webhook handler.
 *
 * Configure in RevenueCat Dashboard -> Project Settings -> Webhooks
 * URL: https://your-domain.com/api/revenuecat/webhook
 *
 * Receives events like:
 * - INITIAL_PURCHASE
 * - RENEWAL
 * - CANCELLATION
 * - UNCANCELLATION
 * - EXPIRATION
 * - BILLING_RETRY
 * - TRANSFER
 * - PRODUCT_CHANGE
 */

const REVENUECAT_AUTH_TOKEN = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN ?? "";

/** Superadmin emails -- never downgrade these users */
const SUPERADMIN_EMAILS = new Set(
  (process.env.SUPERADMIN_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
);

interface RCWebhookEvent {
  event: {
    type: string;
    store: string;
    app_user_id: string;
    product_id: string;
    new_product_id?: string;
    expiration_at?: string;
    purchased_at?: string;
    environment?: string;
  };
  api_key?: string;
}

export async function POST(req: NextRequest) {
  // Auth check -- REJECT if token not configured (production safety)
  if (!REVENUECAT_AUTH_TOKEN) {
    void logAppError({ message: "RevenueCat webhook called without auth token configured", category: "billing", level: "critical" });
    return NextResponse.json({ error: "Webhook auth not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${REVENUECAT_AUTH_TOKEN}`) {
    void logAppError({ message: "RevenueCat webhook unauthorized", category: "billing", level: "warning" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RCWebhookEvent;
  try {
    body = await req.json();
  } catch (err) {
    void logAppError({ message: "RevenueCat webhook invalid JSON", error: String(err), category: "billing", level: "warning" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event } = body;
  if (!event?.type || !event?.app_user_id) {
    return NextResponse.json({ error: "Missing event data" }, { status: 400 });
  }

  const userId = event.app_user_id;
  const eventType = event.type.toUpperCase();

  console.log("[RevenueCat webhook]", eventType, "user:", userId, "product:", event.product_id, "store:", event.store);

  // Superadmin guard: never downgrade superadmin users
  // Use profile table directly — supabase.auth.getUser() fails in webhooks (no session)
  if (SUPERADMIN_EMAILS.size > 0) {
    const supabaseCheck = await createClient();
    if (supabaseCheck) {
      const { data: profile } = await supabaseCheck
        .from("profiles")
        .select("email, account_role")
        .eq("id", userId)
        .maybeSingle();
      const isSuperadmin =
        profile?.account_role === "superadmin" ||
        (profile?.email && SUPERADMIN_EMAILS.has(profile.email.toLowerCase()));
      if (isSuperadmin && ["EXPIRATION", "CANCELLATION"].includes(eventType)) {
        console.log("[RevenueCat webhook] skipping downgrade for superadmin:", userId);
        return NextResponse.json({ received: true, note: "superadmin protected" });
      }
    }
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  // Map product_id to plan -- supports both current and legacy formats
  const productId = event.product_id ?? "";
  const planInfo = resolveProductId(productId);
  const planId = planInfo?.planId ?? "starter";
  const billingPeriod = planInfo?.period ?? (productId.includes("annual") || productId.includes("yearly") ? "annual" : "monthly");

  // Determine subscription status from event type
  const statusMap: Record<string, string> = {
    INITIAL_PURCHASE: "active",
    RENEWAL: "active",
    CANCELLATION: "canceled",
    UNCANCELLATION: "active",
    EXPIRATION: "expired",
    BILLING_RETRY: "past_due",
    TRANSFER: "active",
    PRODUCT_CHANGE: "active",
  };
  const status = statusMap[eventType] ?? "active";

  // PRODUCT_CHANGE: user upgraded/downgraded -- use new_product_id for the new plan
  let effectivePlanId = planId;
  let effectiveBillingPeriod = billingPeriod;
  if (eventType === "PRODUCT_CHANGE" && event.new_product_id) {
    const newPlanInfo = resolveProductId(event.new_product_id);
    if (newPlanInfo) {
      effectivePlanId = newPlanInfo.planId;
      effectiveBillingPeriod = newPlanInfo.period;
    }
  }

  // Upsert subscription row
  const { error: subError } = await supabase.from("subscriptions").upsert({
    user_id: userId,
    provider: "revenuecat",
    provider_subscription_id: `${userId}:${productId}`,
    provider_customer_id: userId,
    plan_id: effectivePlanId,
    billing_period: effectiveBillingPeriod,
    status,
    current_period_end: event.expiration_at ?? null,
    current_period_start: event.purchased_at ?? null,
    price_id: productId,
  }, { onConflict: "user_id,provider,provider_subscription_id" });

  if (subError) {
    void logAppError({ message: "RevenueCat webhook subscription upsert failed", error: subError.message, category: "billing", level: "error" });
  }

  // Update entitlement based on status
  if (status === "active") {
    const { error: entError } = await supabase.from("user_entitlements").upsert({
      user_id: userId,
      plan: effectivePlanId,
      activated_via: "iap",
      expires_at: event.expiration_at ?? null,
    }, { onConflict: "user_id" });

    if (entError) {
      void logAppError({ message: "RevenueCat webhook entitlement upsert failed", error: entError.message, category: "billing", level: "error" });
    }
  } else if (status === "expired") {
    // Subscription expired -- downgrade to starter (free tier)
    const { error: downError } = await supabase.from("user_entitlements").upsert({
      user_id: userId,
      plan: "starter",
      activated_via: "default",
    }, { onConflict: "user_id" });

    if (downError) {
      void logAppError({ message: "RevenueCat webhook downgrade failed", error: downError.message, category: "billing", level: "error" });
    }
  } else if (status === "canceled") {
    // Cancellation but still within billing period (grace period) -- keep entitlement
    // Apple/RevenueCat keeps access until expiration_at. Only downgrade when EXPIRATION fires.
    if (event.expiration_at) {
      const expiresAt = new Date(event.expiration_at);
      const now = new Date();
      if (expiresAt > now) {
        // Still in billing period -- keep entitlement, mark subscription as canceled
        const { error: graceError } = await supabase.from("user_entitlements").upsert({
          user_id: userId,
          plan: effectivePlanId,
          activated_via: "iap",
          expires_at: event.expiration_at,
        }, { onConflict: "user_id" });

        if (graceError) {
          void logAppError({ message: "RevenueCat webhook grace period update failed", error: graceError.message, category: "billing", level: "error" });
        }
      } else {
        // Already past expiration -- downgrade
        const { error: downError } = await supabase.from("user_entitlements").upsert({
          user_id: userId,
          plan: "starter",
          activated_via: "default",
        }, { onConflict: "user_id" });

        if (downError) {
          void logAppError({ message: "RevenueCat webhook post-expiry downgrade failed", error: downError.message, category: "billing", level: "error" });
        }
      }
    }
  }
  // past_due: keep current plan but mark subscription as past_due
  // BILLING_RETRY: keep current entitlement -- user may still have access during retry period

  console.log("[RevenueCat webhook] processed:", eventType, "-> plan:", effectivePlanId, "status:", status);

  return NextResponse.json({ received: true });
}
