/**
 * Stripe checkout + billing portal server actions.
 *
 * - createStripeCheckout: redirect user to Stripe Checkout
 * - createStripePortal: redirect user to Stripe Billing Portal (upgrade/downgrade/cancel)
 * - Both are called from client components via server actions.
 * - BLOCKED on iOS — RevenueCat handles IAP exclusively (App Store rule 3.1.1)
 */

"use server";

import { createCheckoutSession, createPortalSession, isStripeConfigured } from "./stripe";
import type { PlanId, BillingPeriod } from "./plans";
import { headers } from "next/headers";

/** Server-side iOS detection via User-Agent (Capacitor iOS sends custom UA) */
async function isRequestFromIOS(): Promise<boolean> {
  try {
    const hdrs = await headers();
    const ua = hdrs.get("user-agent") ?? "";
    // Capacitor iOS includes "Elevio/" or has no standard browser markers
    return ua.includes("Elevio/") || (ua.includes("iOS") && !ua.includes("Safari"));
  } catch {
    return false;
  }
}

/** Get the Stripe price ID for a plan + period */
function getPriceId(planId: PlanId, period: BillingPeriod): string {
  // Map to your Stripe price IDs
  const PRICE_IDS: Record<string, string> = {
    // starter_monthly: "price_xxx",
    // starter_annual: "price_xxx",
    // pro_monthly: "price_xxx",
    // pro_annual: "price_xxx",
  };
  return PRICE_IDS[`${planId}_${period}`] ?? "";
}

/** Create a Stripe Checkout session for a plan */
export async function createStripeCheckout(params: {
  planId: PlanId;
  period: BillingPeriod;
  userId: string;
  email: string;
  /** Client-side flag: if true, block Stripe (iOS) */
  isIOS?: boolean;
}): Promise<{ url: string | null; error: string | null }> {
  // App Store safeguard: never allow Stripe on iOS
  if (params.isIOS || await isRequestFromIOS()) {
    return { url: null, error: "Paiement via l'App Store uniquement. Utilisez l'onglet Abonnements." };
  }

  if (!isStripeConfigured()) {
    return { url: null, error: "Paiement Stripe non configuré. Utilisez un code d'activation Enterprise." };
  }

  const priceId = getPriceId(params.planId, params.period);
  if (!priceId) {
    return { url: null, error: "Plan non disponible en ligne. Contactez-nous pour un devis." };
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) {
    return { url: null, error: "Configuration manquante (NEXT_PUBLIC_SITE_URL). Contactez le support." };
  }

  const result = await createCheckoutSession({
    priceId,
    userId: params.userId,
    email: params.email,
    successUrl: `${origin}/admin/projects?checkout=success`,
    cancelUrl: `${origin}/paywall?checkout=cancelled`,
  });

  if ("error" in result) {
    return { url: null, error: result.error };
  }

  return { url: result.url ?? null, error: null };
}

/** Create a Stripe Billing Portal session (upgrade/downgrade/cancel) */
export async function createStripeBillingPortal(params: {
  customerId: string;
  /** Client-side flag: if true, block Stripe (iOS) */
  isIOS?: boolean;
}): Promise<{ url: string | null; error: string | null }> {
  // App Store safeguard: never allow Stripe on iOS
  if (params.isIOS || await isRequestFromIOS()) {
    return { url: null, error: "Gestion via l'App Store uniquement." };
  }

  if (!isStripeConfigured()) {
    return { url: null, error: "Stripe non configuré." };
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) {
    return { url: null, error: "Configuration manquante (NEXT_PUBLIC_SITE_URL). Contactez le support." };
  }

  const result = await createPortalSession({
    customerId: params.customerId,
    returnUrl: `${origin}/admin/projects`,
  });

  if ("error" in result) {
    return { url: null, error: result.error };
  }

  return { url: result.url ?? null, error: null };
}
