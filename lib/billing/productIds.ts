/**
 * Apple App Store product IDs for Elevio subscriptions.
 *
 * These are placeholders — configure in App Store Connect before going live.
 * See docs/app-store-connect-subscriptions.md for setup instructions.
 */

export const PRODUCT_IDS = {
  starterMonthly: "com.elevio.starter.monthly",
  starterAnnual: "com.elevio.starter.annual",
  proMonthly: "com.elevio.pro.monthly",
  proAnnual: "com.elevio.pro.annual",
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
