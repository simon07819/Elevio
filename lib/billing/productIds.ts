/**
 * Apple App Store product IDs for Elevio subscriptions.
 *
 * These MUST match the Product IDs created in App Store Connect.
 * Subscription Group: "Elevio Abonnements"
 *
 * Naming convention: elevio_{plan}_{period}
 * Annual price = monthly x 12 x 0.8 (approx 20% discount)
 *
 * Setup checklist:
 * 1. App Store Connect -> Subscriptions -> Create group "Elevio Abonnements"
 * 2. Add products with these exact IDs
 * 3. RevenueCat Dashboard -> Add Apple App Store connection
 * 4. RevenueCat -> Products -> Add each product ID
 * 5. RevenueCat -> Entitlements -> Create "starter" and "pro"
 * 6. RevenueCat -> Attach products to entitlements
 * 7. RevenueCat -> Offerings -> Create "default" offering with packages
 */

export const PRODUCT_IDS = {
  starterMonthly: "elevio_starter_monthly",
  starterAnnual:  "elevio_starter_yearly",
  proMonthly:     "elevio_pro_monthly",
  proAnnual:      "elevio_pro_yearly",
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

/** All purchasable product IDs */
export const ALL_PRODUCT_IDS: ProductId[] = Object.values(PRODUCT_IDS);

/** Map product ID to plan + billing period */
export const PRODUCT_PLAN_MAP: Record<ProductId, { planId: "starter" | "pro"; period: "monthly" | "annual" }> = {
  [PRODUCT_IDS.starterMonthly]: { planId: "starter", period: "monthly" },
  [PRODUCT_IDS.starterAnnual]: { planId: "starter", period: "annual" },
  [PRODUCT_IDS.proMonthly]: { planId: "pro", period: "monthly" },
  [PRODUCT_IDS.proAnnual]: { planId: "pro", period: "annual" },
};

/** Get the product ID for a plan + period */
export function getProductId(planId: "starter" | "pro", period: "monthly" | "annual"): ProductId {
  const key = `${planId}${period.charAt(0).toUpperCase() + period.slice(1)}` as keyof typeof PRODUCT_IDS;
  return PRODUCT_IDS[key];
}

/** Map any product ID (including legacy com.elevio.* format) to plan info */
export function resolveProductId(productId: string): { planId: "starter" | "pro"; period: "monthly" | "annual" } | null {
  // Current format: elevio_starter_monthly
  if (productId in PRODUCT_PLAN_MAP) {
    return PRODUCT_PLAN_MAP[productId as ProductId];
  }
  // Legacy format: com.elevio.starter.monthly -> starter, monthly
  const legacyMatch = productId.match(/^com\.elevio\.(starter|pro)\.(monthly|annual|yearly)$/);
  if (legacyMatch) {
    return { planId: legacyMatch[1] as "starter" | "pro", period: legacyMatch[2] === "yearly" ? "annual" : (legacyMatch[2] as "monthly" | "annual") };
  }
  return null;
}

/** Entitlement identifiers in RevenueCat -- must match RevenueCat Dashboard */
export const ENTITLEMENT_IDS = ["starter", "pro"] as const;
export type EntitlementId = (typeof ENTITLEMENT_IDS)[number];
