import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { logAppError } from "@/lib/appErrors";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
}

/** Map Stripe price IDs to Elevio plan IDs + billing period */
const PRICE_PLAN_MAP: Record<string, { plan: string; period: "monthly" | "annual" }> = {
  // Fill with real price IDs from Stripe Dashboard, e.g.:
  // price_starter_monthly: { plan: "starter", period: "monthly" },
  // price_starter_annual:  { plan: "starter", period: "annual" },
  // price_pro_monthly:     { plan: "pro", period: "monthly" },
  // price_pro_annual:      { plan: "pro", period: "annual" },
};

function planForPrice(priceId: string): { plan: string; period: "monthly" | "annual" } {
  return PRICE_PLAN_MAP[priceId] ?? { plan: "starter", period: "monthly" };
}

/** Helper: sync entitlement + subscription row for a user */
async function syncUserSubscription(params: {
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  plan: string;
  period: "monthly" | "annual";
  status: string;
  priceId: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  // 1. Upsert the subscriptions row
  await supabase.from("subscriptions").upsert({
    user_id: params.userId,
    provider: "stripe",
    provider_subscription_id: params.stripeSubscriptionId,
    provider_customer_id: params.stripeCustomerId,
    plan_id: params.plan,
    billing_period: params.period,
    status: params.status,
    current_period_start: params.currentPeriodStart,
    current_period_end: params.currentPeriodEnd,
    cancel_at_period_end: params.cancelAtPeriodEnd,
    trial_end: params.trialEnd,
    price_id: params.priceId,
  }, { onConflict: "user_id,provider,provider_subscription_id" });

  // 2. Update user_entitlements to reflect the active plan
  if (params.status === "active" || params.status === "trialing") {
    await supabase.from("user_entitlements").upsert({
      user_id: params.userId,
      plan: params.plan,
      activated_via: "stripe",
    }, { onConflict: "user_id" });
  } else if (params.status === "canceled" || params.status === "expired" || params.status === "incomplete") {
    // Downgrade to starter when subscription ends
    await supabase.from("user_entitlements").upsert({
      user_id: params.userId,
      plan: "starter",
      activated_via: "default",
    }, { onConflict: "user_id" });
  }
  // past_due / paused: keep current plan but subscription status shows issue
}

/** Get userId from Stripe customer */
async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ("metadata" in customer) {
      return (customer as Stripe.Customer).metadata?.supabaseUserId ?? null;
    }
  } catch {
    // Customer not found
  }
  return null;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });
  }

  // ── SECURITY: Reject if webhook secret not configured ──
  if (!STRIPE_WEBHOOK_SECRET) {
    void logAppError({ message: "Stripe webhook called without webhook secret configured", category: "billing", level: "critical" });
    return NextResponse.json({ error: "Webhook auth not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    void logAppError({ message: "Stripe webhook missing stripe-signature header", category: "billing", level: "warning" });
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    void logAppError({ message: "Stripe webhook invalid signature", error: String(err), category: "billing", level: "warning" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── checkout.session.completed ──────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.supabaseUserId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineItems = session.line_items as any;
    const priceId = lineItems?.data?.[0]?.price?.id ?? "";
    const { plan, period } = planForPrice(priceId);

    if (userId && session.subscription) {
      const subId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;

      await syncUserSubscription({
        userId,
        stripeSubscriptionId: subId,
        stripeCustomerId: (session.customer as string) ?? "",
        plan,
        period,
        status: "active",
        priceId,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
      });
    }
  }

  // ── customer.subscription.created / updated ─────────────────────────
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const priceId = sub.items.data[0]?.price?.id ?? "";
    const { plan, period } = planForPrice(priceId);
    const customerId = sub.customer as string;
    const userId = await getUserIdFromCustomer(customerId);

    if (userId) {
      await syncUserSubscription({
        userId,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: customerId,
        plan,
        period,
        status: sub.status,
        priceId,
        currentPeriodStart: new Date(sub.start_date * 1000).toISOString(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      });
    }
  }

  // ── customer.subscription.deleted ────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const userId = await getUserIdFromCustomer(customerId);

    if (userId) {
      // Mark subscription as expired, downgrade plan
      await syncUserSubscription({
        userId,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: customerId,
        plan: "starter",
        period: "monthly",
        status: "expired",
        priceId: "",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
      });
    }
  }

  // ── customer.subscription.trial_will_end ─────────────────────────────
  if (event.type === "customer.subscription.trial_will_end") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const userId = await getUserIdFromCustomer(customerId);

    // Just update status — trial ending soon, still active
    if (userId) {
      const priceId = sub.items.data[0]?.price?.id ?? "";
      const { plan, period } = planForPrice(priceId);

      await syncUserSubscription({
        userId,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: customerId,
        plan,
        period,
        status: "trialing",
        priceId,
        currentPeriodStart: new Date(sub.start_date * 1000).toISOString(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      });
    }
  }

  // ── invoice.payment_failed ───────────────────────────────────────────
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const userId = await getUserIdFromCustomer(customerId);

    // Mark subscription as past_due — find via customer_id in subscriptions table
    if (userId) {
      const supabase = await createClient();
      if (supabase) {
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("user_id", userId)
          .eq("provider", "stripe")
          .in("status", ["active", "trialing"]);
      }
    }
  }

  // ── invoice.paid ─────────────────────────────────────────────────────
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const userId = await getUserIdFromCustomer(customerId);

    // Reactivate subscription if it was past_due
    if (userId) {
      const supabase = await createClient();
      if (supabase) {
        await supabase
          .from("subscriptions")
          .update({ status: "active" })
          .eq("user_id", userId)
          .eq("provider", "stripe")
          .eq("status", "past_due");

        // Also ensure entitlement matches the subscription plan
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("plan_id")
          .eq("user_id", userId)
          .eq("provider", "stripe")
          .eq("status", "active")
          .maybeSingle();

        if (subRow) {
          await supabase.from("user_entitlements").upsert({
            user_id: userId,
            plan: subRow.plan_id,
            activated_via: "stripe",
          }, { onConflict: "user_id" });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
