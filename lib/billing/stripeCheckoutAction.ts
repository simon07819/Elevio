/**
 * Stripe Checkout server action — thin wrapper called by PaywallClient.tsx.
 *
 * This file is the ONLY import from a Client Component into Stripe logic.
 * It re-exports `createStripeCheckout` from checkout.ts via a server action,
 * keeping the Stripe SDK and STRIPE_SECRET_KEY out of the client bundle.
 *
 * iOS guard: the caller (PaywallClient) already blocks this path for iOS,
 * but we add a server-side assertNotIOS as defense-in-depth.
 */

"use server";

import { createStripeCheckout } from "@/lib/billing/checkout";
import { isStripeConfigured } from "@/lib/billing/stripe";
import type { PlanId, BillingPeriod } from "@/lib/billing/plans";

export async function startStripeCheckout(params: {
  planId: PlanId;
  period: BillingPeriod;
  userId: string;
  email: string;
}): Promise<{ url: string | null; error: string | null }> {
  // Server-side guard: Stripe not configured
  if (!isStripeConfigured()) {
    return { url: null, error: "Paiement web bientôt disponible. Utilisez un code d'activation Enterprise." };
  }

  return createStripeCheckout({
    ...params,
    isIOS: false, // Caller already blocks iOS — double guard inside checkout.ts
  });
}
