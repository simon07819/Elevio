/**
 * RevenueCat integration for Elevio.
 *
 * Uses @revenuecat/purchases-capacitor on native iOS,
 * falls back to placeholder data on web/PWA.
 *
 * Architecture:
 * - iOS: RevenueCat SDK via Capacitor → IAP
 * - Web: Stripe Checkout (see stripe.ts)
 * - Entitlements are synced to user_entitlements via RevenueCat webhooks
 *   or client-side sync after purchase.
 */

import { PRODUCT_IDS, PRODUCT_PLAN_MAP, type ProductId } from "./productIds";
import type { PlanId } from "./plans";
import { captureError } from "@/lib/errorTracking";

export interface Offering {
  productId: ProductId;
  planId: "starter" | "pro";
  period: "monthly" | "annual";
  price: string;
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

const REVENUECAT_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY ?? "";

/** Check if RevenueCat is available (native Capacitor) */
export async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Configure RevenueCat SDK — call once after auth */
export async function configureRevenueCat(userId: string): Promise<void> {
  if (!REVENUECAT_API_KEY) return;

  const native = await isNativePlatform();
  if (!native) return;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId,
    });
  } catch (err) {
    console.error("[RevenueCat] configure failed:", err);
    captureError(err, { action: "revenuecat_configure", userId });
  }
}

/**
 * Get available offerings from RevenueCat.
 * On web, returns placeholder data.
 */
export async function getOfferings(): Promise<Offering[]> {
  const native = await isNativePlatform();
  if (!native || !REVENUECAT_API_KEY) {
    return [
      { productId: PRODUCT_IDS.starterMonthly, planId: "starter", period: "monthly", price: "199 $CA/mois" },
      { productId: PRODUCT_IDS.starterAnnual, planId: "starter", period: "annual", price: "1990 $CA/an" },
      { productId: PRODUCT_IDS.proMonthly, planId: "pro", period: "monthly", price: "499 $CA/mois" },
      { productId: PRODUCT_IDS.proAnnual, planId: "pro", period: "annual", price: "4990 $CA/an" },
    ];
  }

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const offerings = await Purchases.getOfferings();

    const results: Offering[] = [];
    const allPackages = offerings.current?.availablePackages ?? [];

    for (const pkg of allPackages) {
      const productId = pkg.product.identifier as ProductId;
      const planInfo = PRODUCT_PLAN_MAP[productId];
      if (!planInfo) continue;

      results.push({
        productId,
        planId: planInfo.planId,
        period: planInfo.period,
        price: pkg.product.priceString,
      });
    }

    return results.length > 0 ? results : [
      { productId: PRODUCT_IDS.starterMonthly, planId: "starter", period: "monthly", price: "199 $CA/mois" },
      { productId: PRODUCT_IDS.proMonthly, planId: "pro", period: "monthly", price: "499 $CA/mois" },
    ];
  } catch (err) {
    console.error("[RevenueCat] getOfferings failed:", err);
    captureError(err, { action: "revenuecat_getOfferings" });
    return [];
  }
}

/**
 * Purchase a product via RevenueCat.
 * On web, returns a "not available" result.
 */
export async function purchaseProduct(productId: ProductId): Promise<PurchaseResult> {
  const native = await isNativePlatform();
  if (!native || !REVENUECAT_API_KEY) {
    return {
      ok: false,
      error: "Abonnements Apple disponibles via l'app iOS. Utilisez un code d'activation Enterprise sur le web.",
    };
  }

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");

    // Get offerings and find the matching package
    const offerings = await Purchases.getOfferings();
    const allPackages = offerings.current?.availablePackages ?? [];
    const targetPkg = allPackages.find((p) => p.product.identifier === productId);

    if (!targetPkg) {
      return { ok: false, error: "Produit non trouvé dans les offres." };
    }

    const result = await Purchases.purchasePackage({ aPackage: targetPkg });

    // Sync entitlement + subscription to Supabase after successful purchase
    const planInfo = PRODUCT_PLAN_MAP[productId];
    if (planInfo) {
      // Extract transaction info from purchase result
      const transactionId = result?.customerInfo?.originalAppUserId
        ?? result?.productIdentifier
        ?? productId;
      await syncEntitlementToSupabase(
        planInfo.planId as PlanId,
        "iap",
        null,
        transactionId,
      );
    }

    return { ok: true, productId };
  } catch (err: unknown) {
    const rcError = err as { code?: string; message?: string; userCancelled?: boolean };
    if (rcError.userCancelled) {
      return { ok: false, error: "Achat annulé." };
    }
    return { ok: false, error: rcError.message ?? "Erreur d'achat." };
  }
}

/**
 * Restore previous purchases via RevenueCat.
 */
export async function restorePurchases(): Promise<CustomerEntitlement | null> {
  const native = await isNativePlatform();
  if (!native || !REVENUECAT_API_KEY) return null;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    const entitlement = extractEntitlement(customerInfo);
    // Sync restored entitlement to backend
    if (entitlement && entitlement.isActive) {
      await syncEntitlementToSupabase(entitlement.planId, "iap", entitlement.expiresAt);
    }
    return entitlement;
  } catch (err) {
    console.error("[RevenueCat] restorePurchases failed:", err);
    captureError(err, { action: "revenuecat_restorePurchases" });
    return null;
  }
}

/**
 * Get the current customer entitlement from RevenueCat.
 * On web, returns null (fallback to DB entitlements).
 */
export async function getCustomerEntitlement(): Promise<CustomerEntitlement | null> {
  const native = await isNativePlatform();
  if (!native || !REVENUECAT_API_KEY) return null;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.getCustomerInfo();
    return extractEntitlement(customerInfo);
  } catch (err) {
    console.error("[RevenueCat] getCustomerInfo failed:", err);
    captureError(err, { action: "revenuecat_getCustomerInfo" });
    return null;
  }
}

/** Extract entitlement info from RevenueCat CustomerInfo */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEntitlement(customerInfo: any): CustomerEntitlement | null {
  const entitlements = customerInfo?.entitlements as Record<string, unknown> | undefined;
  const active = entitlements?.active as Record<string, Record<string, unknown>> | undefined;

  if (!active || Object.keys(active).length === 0) return null;

  // Map entitlement identifier to plan
  const entitlementToPlan: Record<string, PlanId> = {
    starter: "starter",
    pro: "pro",
    enterprise: "enterprise",
  };

  for (const [key, info] of Object.entries(active)) {
    const planId = entitlementToPlan[key];
    if (planId) {
      return {
        planId,
        expiresAt: (info.expiresDate as string) ?? null,
        isActive: true,
      };
    }
  }

  // Return the first active entitlement as fallback
  const firstKey = Object.keys(active)[0];
  const firstInfo = active[firstKey];
  return {
    planId: (entitlementToPlan[firstKey] ?? "starter") as PlanId,
    expiresAt: (firstInfo?.expiresDate as string) ?? null,
    isActive: true,
  };
}

/** Sync an entitlement back to Supabase after IAP purchase */
async function syncEntitlementToSupabase(planId: PlanId, activatedVia: string, expiresAt?: string | null, transactionId?: string): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Upsert subscription row
    if (transactionId) {
      await supabase.from("subscriptions").upsert({
        user_id: user.id,
        provider: "revenuecat",
        provider_subscription_id: transactionId,
        provider_customer_id: user.id,
        plan_id: planId,
        billing_period: "monthly", // RevenueCat manages this
        status: "active",
        current_period_end: expiresAt ?? null,
        price_id: planId === "pro" ? "com.elevio.pro.monthly" : "com.elevio.starter.monthly",
      }, { onConflict: "user_id,provider,provider_subscription_id" });
    }

    // 2. Upsert entitlement
    await supabase
      .from("user_entitlements")
      .upsert({ user_id: user.id, plan: planId, activated_via: activatedVia, expires_at: expiresAt ?? null }, { onConflict: "user_id" });
  } catch (err) {
    console.error("[RevenueCat] sync entitlement failed:", err);
    captureError(err, { action: "revenuecat_syncEntitlement" });
  }
}

/** Log out RevenueCat user */
export async function logOutRevenueCat(): Promise<void> {
  const native = await isNativePlatform();
  if (!native) return;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.logOut();
  } catch (err) {
    console.error("[RevenueCat] logOut failed:", err);
    captureError(err, { action: "revenuecat_logOut" });
  }
}
