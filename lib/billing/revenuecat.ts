/**
 * RevenueCat integration interface.
 *
 * Prepared for future iOS Capacitor + RevenueCat SDK.
 * Currently mock/no-op on web — does not install any native plugin.
 *
 * Architecture is compatible with Android (Google Play Billing) later.
 */

import { PRODUCT_IDS, type ProductId } from "./productIds";
import type { PlanId } from "./plans";

export interface Offering {
  productId: ProductId;
  planId: "starter" | "pro";
  period: "monthly" | "annual";
  price: string; // formatted price from store
}

export interface PurchaseResult {
  ok: boolean;
  productId?: ProductId;
  error?: string;
}

export interface CustomerEntitlement {
  planId: PlanId;
  expiresAt: string | null;
  isActive: boolean;
}

/**
 * Get available offerings from RevenueCat.
 * On web, returns placeholder data.
 */
export async function getOfferings(): Promise<Offering[]> {
  // TODO: Replace with RevenueCat SDK when Capacitor is set up
  // For now, return placeholder offerings
  return [
    { productId: PRODUCT_IDS.starterMonthly, planId: "starter", period: "monthly", price: "29 $CA/mois" },
    { productId: PRODUCT_IDS.starterAnnual, planId: "starter", period: "annual", price: "290 $CA/an" },
    { productId: PRODUCT_IDS.proMonthly, planId: "pro", period: "monthly", price: "79 $CA/mois" },
    { productId: PRODUCT_IDS.proAnnual, planId: "pro", period: "annual", price: "790 $CA/an" },
  ];
}

/**
 * Purchase a product via RevenueCat.
 * On web, returns a "not available" result.
 */
export async function purchaseProduct(_productId: ProductId): Promise<PurchaseResult> {
  // TODO: Replace with RevenueCat SDK when Capacitor is set up
  return {
    ok: false,
    error: "Abonnements Apple bientôt disponibles. Utilisez un code d'activation Enterprise pour l'instant.",
  };
}

/**
 * Restore previous purchases via RevenueCat.
 * On web, returns empty entitlement.
 */
export async function restorePurchases(): Promise<CustomerEntitlement | null> {
  // TODO: Replace with RevenueCat SDK when Capacitor is set up
  return null;
}

/**
 * Get the current customer entitlement from RevenueCat.
 * On web, returns null (fallback to DB-based entitlements).
 */
export async function getCustomerEntitlement(): Promise<CustomerEntitlement | null> {
  // TODO: Replace with RevenueCat SDK when Capacitor is set up
  return null;
}
