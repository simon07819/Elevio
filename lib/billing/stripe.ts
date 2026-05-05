/**
 * Stripe integration for Elevio.
 *
 * When STRIPE_SECRET_KEY is set, getSuperadminBilling() returns real
 * subscription + payment data from Stripe. Otherwise falls back to
 * the existing entitlement-based mock.
 *
 * Architecture:
 * - Web: Stripe Checkout / Billing Portal
 * - iOS: RevenueCat IAP (see revenuecat.ts)
 * - Entitlements are synced back to user_entitlements via webhooks.
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export type StripeSubscription = {
  id: string;
  userId: string;
  email: string;
  plan: string;
  status: Stripe.Subscription.Status;
  startDate: string;
  cancelAtPeriodEnd: boolean;
  priceId: string;
  provider: "Stripe";
};

export type StripePayment = {
  id: string;
  userId: string;
  email: string;
  amount: number;
  currency: string;
  status: string;
  created: string;
  plan: string;
};

/** Map Stripe price IDs to Elevio plan IDs */
const PRICE_PLAN_MAP: Record<string, string> = {
  // Fill with real price IDs from Stripe Dashboard, e.g.:
  // price_xxx: "starter",
  // price_yyy: "pro",
};

/** Get the Elevio plan for a Stripe price ID */
function planForPrice(priceId: string): string {
  return PRICE_PLAN_MAP[priceId] ?? "starter";
}

/** Fetch all active subscriptions from Stripe */
export async function getStripeSubscriptions(limit = 100): Promise<StripeSubscription[]> {
  const stripe = getStripe();
  if (!stripe) return [];

  const subs = await stripe.subscriptions.list({
    limit,
    status: "all",
    expand: ["data.customer"],
  });

  return subs.data.map((sub) => {
    const customer = sub.customer as Stripe.Customer;
    const priceId = sub.items.data[0]?.price?.id ?? "";
    return {
      id: sub.id,
      userId: customer?.metadata?.supabaseUserId ?? customer?.id ?? "",
      email: customer?.email ?? "",
      plan: planForPrice(priceId),
      status: sub.status,
      startDate: new Date(sub.start_date * 1000).toISOString(),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      priceId,
      provider: "Stripe" as const,
    };
  });
}

/** Fetch recent payments (invoices) from Stripe */
export async function getStripePayments(limit = 100): Promise<StripePayment[]> {
  const stripe = getStripe();
  if (!stripe) return [];

  const invoices = await stripe.invoices.list({
    limit,
    expand: ["data.customer"],
  });

  return invoices.data
    .filter((inv) => inv.status === "paid")
    .map((inv) => {
      const customer = inv.customer as Stripe.Customer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const line = inv.lines.data[0] as any;
      const priceId = line?.pricing?.price_details?.price ?? "";
      return {
        id: inv.id,
        userId: customer?.metadata?.supabaseUserId ?? customer?.id ?? "",
        email: customer?.email ?? "",
        amount: inv.amount_paid / 100,
        currency: inv.currency.toUpperCase(),
        status: inv.status ?? "unknown",
        created: new Date(inv.created * 1000).toISOString(),
        plan: planForPrice(priceId),
      };
    });
}

/** Create a Stripe Checkout session for a plan */
export async function createCheckoutSession(params: {
  priceId: string;
  userId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe non configuré." };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: params.email,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { supabaseUserId: params.userId },
    });

    return { url: session.url ?? "" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Create a Stripe Customer Portal session */
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe non configuré." };

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });

    return { url: session.url };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
