import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * RevenueCat webhook handler.
 *
 * Configure in RevenueCat Dashboard → Project Settings → Webhooks
 * URL: https://your-domain.com/api/revenuecat/webhook
 *
 * Receives events like:
 * - INITIAL_PURCHASE
 * - RENEWAL
 * - CANCELLATION
 * - EXPIRATION
 * - BILLING_RETRY
 * - TRANSFER
 */

const REVENUECAT_AUTH_TOKEN = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN ?? "";

interface RCWebhookEvent {
  event: {
    type: string;
    store: string;
    app_user_id: string;
    product_id: string;
    expiration_at?: string;
    purchased_at?: string;
    environment?: string;
  };
  api_key?: string;
}

export async function POST(req: NextRequest) {
  // Auth check
  if (REVENUECAT_AUTH_TOKEN) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${REVENUECAT_AUTH_TOKEN}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: RCWebhookEvent;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event } = body;
  if (!event?.type || !event?.app_user_id) {
    return NextResponse.json({ error: "Missing event data" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  // Map product_id to plan
  const productId = event.product_id ?? "";
  const planMap: Record<string, string> = {
    "com.elevio.starter.monthly": "starter",
    "com.elevio.starter.annual": "starter",
    "com.elevio.pro.monthly": "pro",
    "com.elevio.pro.annual": "pro",
  };
  const planId = planMap[productId] ?? "starter";
  const userId = event.app_user_id;

  const eventType = event.type.toUpperCase();

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

  // Upsert subscription row
  await supabase.from("subscriptions").upsert({
    user_id: userId,
    provider: "revenuecat",
    provider_subscription_id: `${userId}:${productId}`,
    provider_customer_id: userId,
    plan_id: planId,
    billing_period: productId.includes("annual") ? "annual" : "monthly",
    status,
    current_period_end: event.expiration_at ?? null,
    current_period_start: event.purchased_at ?? null,
    price_id: productId,
  }, { onConflict: "user_id,provider,provider_subscription_id" });

  // Update entitlement based on status
  if (status === "active") {
    await supabase.from("user_entitlements").upsert({
      user_id: userId,
      plan: planId,
      activated_via: "iap",
      expires_at: event.expiration_at ?? null,
    }, { onConflict: "user_id" });
  } else if (status === "expired") {
    // Subscription expired — downgrade to starter
    await supabase.from("user_entitlements").upsert({
      user_id: userId,
      plan: "starter",
      activated_via: "default",
    }, { onConflict: "user_id" });
  } else if (status === "canceled") {
    // Cancellation but still within billing period (grace period) — keep entitlement
    // Apple/RevenueCat keeps access until expiration_at. Only downgrade when EXPIRATION fires.
    // Update subscription status to canceled but keep the entitlement active until expiration.
    if (event.expiration_at) {
      const expiresAt = new Date(event.expiration_at);
      const now = new Date();
      if (expiresAt > now) {
        // Still in billing period — keep entitlement, mark subscription as canceled
        await supabase.from("user_entitlements").upsert({
          user_id: userId,
          plan: planId,
          activated_via: "iap",
          expires_at: event.expiration_at,
        }, { onConflict: "user_id" });
      } else {
        // Already past expiration — downgrade
        await supabase.from("user_entitlements").upsert({
          user_id: userId,
          plan: "starter",
          activated_via: "default",
        }, { onConflict: "user_id" });
      }
    }
  }
  // past_due: keep current plan but mark subscription as past_due
  // BILLING_RETRY: keep current entitlement — user may still have access during retry period

  return NextResponse.json({ received: true });
}
