/**
 * Pricing & monetization strategy tests.
 *
 * Verifies:
 * - Value-based plan descriptions exist
 * - Feature gates per plan (efficiency score, insights, operator perf)
 * - Upgrade CTA component exists and links to paywall
 * - Passenger QR flow never sees paywall
 * - iOS uses RevenueCat only, web uses Stripe only
 * - Existing plans still work
 * - Admin sees upgrade CTA only in admin context
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const PLANS = readFileSync(join(root, "lib/billing/plans.ts"), "utf8");
const ENTITLEMENTS = readFileSync(join(root, "lib/billing/entitlements.ts"), "utf8");
const PLAN_GUARDS = readFileSync(join(root, "lib/billing/planGuards.ts"), "utf8");
const PRICING_GRID = readFileSync(join(root, "components/public/PricingGrid.tsx"), "utf8");
const APP_PRICING = readFileSync(join(root, "components/mobile/AppPricingScreen.tsx"), "utf8");
const PAYWALL_CLIENT = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const UPGRADE_CTA = readFileSync(join(root, "components/admin/UpgradeCTA.tsx"), "utf8");
const ADMIN_ANALYTICS = readFileSync(join(root, "components/admin/AdminAnalyticsDashboard.tsx"), "utf8");
const ANALYTICS_PAGE = readFileSync(join(root, "app/admin/analytics/page.tsx"), "utf8");
const REQUEST_FORM = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
const SCAN_HOME = readFileSync(join(root, "components/ScanHome.tsx"), "utf8");
const I18N = readFileSync(join(root, "lib/i18n.ts"), "utf8");
const PLATFORM = readFileSync(join(root, "lib/platform.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. Value-based plan descriptions
// ═══════════════════════════════════════════════════════════════════

test("pricing: Starter plan has French value description", () => {
  assert.match(PLANS, /Réduire les temps d'attente/, "Starter value description in French");
});

test("pricing: Pro plan has French value description", () => {
  assert.match(PLANS, /Voir où le temps est perdu/, "Pro value description in French");
});

test("pricing: Enterprise plan has French value description", () => {
  assert.match(PLANS, /Prouver les gains de productivité/, "Enterprise value description in French");
});

// ═══════════════════════════════════════════════════════════════════
// 2. Feature gates per plan in PlanLimit
// ═══════════════════════════════════════════════════════════════════

test("pricing: PlanLimit has new feature gate fields", () => {
  assert.match(PLANS, /analyticsDashboard/, "analyticsDashboard field");
  assert.match(PLANS, /efficiencyScore/, "efficiencyScore field");
  assert.match(PLANS, /businessInsights/, "businessInsights field");
  assert.match(PLANS, /peakHours/, "peakHours field");
  assert.match(PLANS, /floorUsage/, "floorUsage field");
  assert.match(PLANS, /operatorPerformance/, "operatorPerformance field");
  assert.match(PLANS, /customSupport/, "customSupport field");
});

test("pricing: Starter has limited analytics (no efficiency score, no insights, no operator perf)", () => {
  const starterSection = PLANS.match(/starter: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(starterSection, /efficiencyScore: false/, "Starter no efficiency score");
  assert.match(starterSection, /businessInsights: false/, "Starter no business insights");
  assert.match(starterSection, /operatorPerformance: false/, "Starter no operator perf");
  assert.match(starterSection, /analyticsDashboard: true/, "Starter has analytics dashboard");
  assert.match(starterSection, /peakHours: true/, "Starter has peak hours");
  assert.match(starterSection, /floorUsage: true/, "Starter has floor usage");
});

test("pricing: Pro has full analytics (efficiency score, insights, operator perf)", () => {
  const proSection = PLANS.match(/pro: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(proSection, /efficiencyScore: true/, "Pro has efficiency score");
  assert.match(proSection, /businessInsights: true/, "Pro has business insights");
  assert.match(proSection, /operatorPerformance: true/, "Pro has operator perf");
  assert.match(proSection, /analyticsDashboard: true/, "Pro has analytics dashboard");
});

test("pricing: Enterprise has all features including custom support", () => {
  const entSection = PLANS.match(/enterprise: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(entSection, /efficiencyScore: true/, "Enterprise has efficiency score");
  assert.match(entSection, /businessInsights: true/, "Enterprise has business insights");
  assert.match(entSection, /operatorPerformance: true/, "Enterprise has operator perf");
  assert.match(entSection, /customSupport: true/, "Enterprise has custom support");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Entitlement check functions exist
// ═══════════════════════════════════════════════════════════════════

test("pricing: entitlement functions for new features exist", () => {
  assert.match(ENTITLEMENTS, /hasAnalyticsDashboard/, "hasAnalyticsDashboard");
  assert.match(ENTITLEMENTS, /hasEfficiencyScore/, "hasEfficiencyScore");
  assert.match(ENTITLEMENTS, /hasBusinessInsights/, "hasBusinessInsights");
  assert.match(ENTITLEMENTS, /hasOperatorPerformance/, "hasOperatorPerformance");
  assert.match(ENTITLEMENTS, /hasCustomSupport/, "hasCustomSupport");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Upgrade CTA component
// ═══════════════════════════════════════════════════════════════════

test("pricing: UpgradeCTA component exists with paywall link", () => {
  assert.match(UPGRADE_CTA, /"use client"/, "is client component");
  assert.match(UPGRADE_CTA, /\/paywall/, "links to paywall");
  assert.match(UPGRADE_CTA, /Lock/, "shows lock icon");
  assert.match(UPGRADE_CTA, /Upgrade/, "has upgrade button");
  assert.match(UPGRADE_CTA, /requiredPlan/, "accepts requiredPlan prop");
  assert.match(UPGRADE_CTA, /feature/, "accepts feature prop");
});

test("pricing: UpgradeCTA differentiates Pro vs Enterprise plans", () => {
  assert.match(UPGRADE_CTA, /pro.*enterprise|enterprise.*pro/s, "handles both plan levels");
  assert.match(UPGRADE_CTA, /planLabel/, "shows plan label");
});

test("pricing: UpgradeCTA uses isIOS for platform-aware links", () => {
  assert.match(UPGRADE_CTA, /isIOS/, "checks iOS platform");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Admin analytics dashboard uses plan gates
// ═══════════════════════════════════════════════════════════════════

test("pricing: AdminAnalyticsDashboard accepts planId and gates features", () => {
  assert.match(ADMIN_ANALYTICS, /planId/, "accepts planId prop");
  assert.match(ADMIN_ANALYTICS, /isProOrAbove/, "checks plan level");
  assert.match(ADMIN_ANALYTICS, /LockedSection/, "has locked section component");
  assert.match(ADMIN_ANALYTICS, /UpgradeCTA/, "uses UpgradeCTA for locked features");
});

test("pricing: Efficiency score locked behind Pro plan", () => {
  assert.match(ADMIN_ANALYTICS, /Efficiency score.*pro|isProOrAbove.*Efficiency/s, "efficiency score gated");
  assert.match(ADMIN_ANALYTICS, /LockedSection.*Efficiency|efficiencyScore.*pro/s, "efficiency score locked section");
});

test("pricing: Business insights locked behind Pro plan", () => {
  assert.match(ADMIN_ANALYTICS, /Insights.*isProOrAbove|isProOrAbove.*Insights/s, "insights gated");
});

test("pricing: Operator performance locked behind Pro plan", () => {
  assert.match(ADMIN_ANALYTICS, /Operator Performance.*isProOrAbove|isProOrAbove.*Operator Performance/s, "operator perf gated");
});

test("pricing: Analytics page passes planId from server", () => {
  assert.match(ANALYTICS_PAGE, /getPlanForUser/, "fetches plan from server");
  assert.match(ANALYTICS_PAGE, /planId/, "passes planId to dashboard");
});

// ═══════════════════════════════════════════════════════════════════
// 6. Passenger flow NEVER sees paywall
// ═══════════════════════════════════════════════════════════════════

test("pricing: RequestForm (passenger) has zero billing references", () => {
  assert.doesNotMatch(REQUEST_FORM, /paywall|billing|plan|upgrade|entitlement/i, "no billing in passenger form");
});

test("pricing: ScanHome (passenger entry) has zero billing references", () => {
  assert.doesNotMatch(SCAN_HOME, /paywall|billing|upgrade|entitlement/i, "no billing in scan home");
});

test("pricing: UpgradeCTA is only in admin components, not in passenger components", () => {
  // Confirm UpgradeCTA is NOT imported in RequestForm or ScanHome
  assert.doesNotMatch(REQUEST_FORM, /UpgradeCTA/, "no UpgradeCTA in passenger form");
  assert.doesNotMatch(SCAN_HOME, /UpgradeCTA/, "no UpgradeCTA in scan home");
});

// ═══════════════════════════════════════════════════════════════════
// 7. iOS uses RevenueCat only, web uses Stripe only
// ═══════════════════════════════════════════════════════════════════

test("pricing: PaywallClient uses RevenueCat on iOS, Stripe via server action on web", () => {
  assert.match(PAYWALL_CLIENT, /isIOS/, "checks iOS platform");
  assert.match(PAYWALL_CLIENT, /purchaseProduct/, "RevenueCat IAP");
  assert.match(PAYWALL_CLIENT, /startStripeCheckout/, "Stripe checkout via server action (no direct import)");
  assert.doesNotMatch(PAYWALL_CLIENT, /from.*checkout/, "no direct import of checkout.ts");
  assert.doesNotMatch(PAYWALL_CLIENT, /from.*\"@\/lib\/billing\/stripe\"/, "no direct import of stripe.ts");
});

test("pricing: AppPricingScreen uses IAP on iOS", () => {
  assert.match(APP_PRICING, /isIOS/, "checks iOS platform");
  assert.match(APP_PRICING, /purchaseProduct/, "RevenueCat IAP on mobile");
  assert.match(APP_PRICING, /handleIAPPurchase/, "IAP purchase handler");
});

test("pricing: Platform guard blocks Stripe on iOS", () => {
  assert.match(PLATFORM, /assertNotIOS/, "assertNotIOS guard exists");
  assert.match(PLATFORM, /external payments not allowed on iOS/, "iOS payment block message");
});

// ═══════════════════════════════════════════════════════════════════
// 8. Existing plans still work
// ═══════════════════════════════════════════════════════════════════

test("pricing: 5 plan IDs still defined (free, starter, pro, business, enterprise)", () => {
  assert.match(PLANS, /"free"/, "free plan");
  assert.match(PLANS, /"starter"/, "starter plan");
  assert.match(PLANS, /"pro"/, "pro plan");
  assert.match(PLANS, /"business"/, "business plan");
  assert.match(PLANS, /"enterprise"/, "enterprise plan");
});

test("pricing: Starter price $199/mo, Pro $499/mo", () => {
  assert.match(PLANS, /priceMonthly: 199/, "Starter $199/mo");
  assert.match(PLANS, /priceMonthly: 499/, "Pro $499/mo");
});

test("pricing: effectivePlanId still maps free → starter", () => {
  assert.match(PLANS, /effectivePlanId/, "effectivePlanId function");
  assert.match(PLANS, /FREE_EQUIVALENT.*starter/, "free maps to starter");
});

test("pricing: planGuards still enforce project/operator/request limits", () => {
  assert.match(PLAN_GUARDS, /enforceProjectLimit/, "project limit guard");
  assert.match(PLAN_GUARDS, /enforceOperatorLimit/, "operator limit guard");
  assert.match(PLAN_GUARDS, /enforceRequestLimit/, "request limit guard");
});

// ═══════════════════════════════════════════════════════════════════
// 9. Value copy in pricing UIs
// ═══════════════════════════════════════════════════════════════════

test("pricing: PricingGrid shows French value-based features", () => {
  assert.match(PRICING_GRID, /Réduire les temps/, "Starter French value copy");
  assert.match(PRICING_GRID, /Voir où le temps est perdu|Optimiser la performance/, "Pro French value copy");
  assert.match(PRICING_GRID, /Prouver les gains/, "Enterprise French value copy");
});

test("pricing: AppPricingScreen shows French value-based features", () => {
  assert.match(APP_PRICING, /Réduire les temps/, "Starter French value copy");
  assert.match(APP_PRICING, /Optimiser la performance/, "Pro French value copy");
  assert.match(APP_PRICING, /Prouver les gains/, "Enterprise French value copy");
});

test("pricing: PaywallClient shows French feature labels", () => {
  assert.match(PAYWALL_CLIENT, /Score d'efficacité/, "efficiency score feature in French");
  assert.match(PAYWALL_CLIENT, /Analyses commerciales/, "business insights feature in French");
  assert.match(PAYWALL_CLIENT, /Performance opérateur/, "operator performance feature in French");
  assert.match(PAYWALL_CLIENT, /Voir où le temps est perdu/, "value copy for starter in French");
});

// ═══════════════════════════════════════════════════════════════════
// 10. i18n keys for pricing value copy
// ═══════════════════════════════════════════════════════════════════

test("pricing: i18n has pricing value keys", () => {
  assert.match(I18N, /"pricing\.reduceWait"/, "pricing.reduceWait key");
  assert.match(I18N, /"pricing\.seeTimeLost"/, "pricing.seeTimeLost key");
  assert.match(I18N, /"pricing\.optimizeOps"/, "pricing.optimizeOps key");
  assert.match(I18N, /"pricing\.peakCongestion"/, "pricing.peakCongestion key");
  assert.match(I18N, /"pricing\.proveGains"/, "pricing.proveGains key");
});
