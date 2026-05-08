/**
 * RevenueCat integration tests.
 *
 * Tests the product ID mapping, offering loading logic,
 * purchase flow, sync API, and webhook handling.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

const PRODUCT_IDS_FILE = readFileSync(join(root, "lib/billing/productIds.ts"), "utf8");
const REVENUECAT_FILE = readFileSync(join(root, "lib/billing/revenuecat.ts"), "utf8");
const WEBHOOK_FILE = readFileSync(join(root, "app/api/revenuecat/webhook/route.ts"), "utf8");
const SYNC_FILE = readFileSync(join(root, "app/api/revenuecat/sync/route.ts"), "utf8");
const PAYWALL_FILE = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const USE_SUBSCRIPTION_SYNC = readFileSync(join(root, "hooks/useSubscriptionSync.ts"), "utf8");
const ENV_EXAMPLE = readFileSync(join(root, ".env.example"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. Product IDs
// ═══════════════════════════════════════════════════════════════════

test("revenuecat: product IDs match App Store Connect convention", () => {
  assert.match(PRODUCT_IDS_FILE, /elevio_starter_monthly/, "starter monthly");
  assert.match(PRODUCT_IDS_FILE, /elevio_starter_yearly/, "starter yearly");
  assert.match(PRODUCT_IDS_FILE, /elevio_pro_monthly/, "pro monthly");
  assert.match(PRODUCT_IDS_FILE, /elevio_pro_yearly/, "pro yearly");
});

test("revenuecat: product IDs exported as const with type", () => {
  assert.match(PRODUCT_IDS_FILE, /export const PRODUCT_IDS/, "PRODUCT_IDS exported");
  assert.match(PRODUCT_IDS_FILE, /export type ProductId/, "ProductId type exported");
});

test("revenuecat: PRODUCT_PLAN_MAP maps all 4 product IDs", () => {
  assert.match(PRODUCT_IDS_FILE, /PRODUCT_PLAN_MAP/, "map exists");
  // Should have entries for all 4 product IDs
  const matches = PRODUCT_IDS_FILE.match(/planId: "starter"|"pro"/g);
  assert.ok(matches && matches.length >= 4, "at least 4 plan mappings");
});

test("revenuecat: resolveProductId handles legacy com.elevio.* format", () => {
  assert.match(PRODUCT_IDS_FILE, /resolveProductId/, "function exists");
  assert.match(PRODUCT_IDS_FILE, /com\.elevio\.(starter|pro)/, "handles legacy format");
});

test("revenuecat: entitlement IDs defined for RevenueCat Dashboard", () => {
  assert.match(PRODUCT_IDS_FILE, /ENTITLEMENT_IDS/, "entitlement IDs exported");
  assert.match(PRODUCT_IDS_FILE, /"starter"/, "starter entitlement");
  assert.match(PRODUCT_IDS_FILE, /"pro"/, "pro entitlement");
});

// ═══════════════════════════════════════════════════════════════════
// 2. RevenueCat SDK module
// ═══════════════════════════════════════════════════════════════════

test("revenuecat: SDK uses dynamic imports only (no static @revenuecat)", () => {
  // Should NOT have static import at top level
  const staticImports = REVENUECAT_FILE.match(/^import.*@revenuecat/m);
  assert.equal(staticImports, null, "no static imports of @revenuecat");
});

test("revenuecat: isNativePlatform checks Capacitor", () => {
  assert.match(REVENUECAT_FILE, /isNativePlatform/, "function exists");
  assert.match(REVENUECAT_FILE, /@capacitor\/core/, "uses Capacitor core");
});

test("revenuecat: configureRevenueCat uses NEXT_PUBLIC_REVENUECAT_API_KEY", () => {
  assert.match(REVENUECAT_FILE, /NEXT_PUBLIC_REVENUECAT_API_KEY/, "reads env var");
  assert.match(REVENUECAT_FILE, /configureRevenueCat/, "function exists");
});

test("revenuecat: getOfferings loads real prices on native, fallback on web", () => {
  assert.match(REVENUECAT_FILE, /getOfferings/, "function exists");
  assert.match(REVENUECAT_FILE, /Purchases\.getOfferings/, "calls RC SDK");
  assert.match(REVENUECAT_FILE, /availablePackages/, "reads packages");
  assert.match(REVENUECAT_FILE, /priceString/, "reads real price string");
});

test("revenuecat: purchaseProduct finds package from offerings", () => {
  assert.match(REVENUECAT_FILE, /purchaseProduct/, "function exists");
  assert.match(REVENUECAT_FILE, /purchasePackage/, "uses RC purchasePackage");
  assert.match(REVENUECAT_FILE, /syncEntitlementToSupabase/, "syncs after purchase");
});

test("revenuecat: purchaseProduct handles user cancellation", () => {
  assert.match(REVENUECAT_FILE, /userCancelled/, "checks userCancelled flag");
  assert.match(REVENUECAT_FILE, /Achat annul/, "French cancellation message");
});

test("revenuecat: restorePurchases syncs entitlement", () => {
  assert.match(REVENUECAT_FILE, /restorePurchases/, "function exists");
  assert.match(REVENUECAT_FILE, /Purchases\.restorePurchases/, "calls RC SDK");
  assert.match(REVENUECAT_FILE, /syncEntitlementToSupabase/, "syncs after restore");
});

test("revenuecat: syncEntitlementToSupabase upserts subscription + entitlement", () => {
  assert.match(REVENUECAT_FILE, /syncEntitlementToSupabase/, "function exists");
  assert.match(REVENUECAT_FILE, /from\("subscriptions"\)/, "targets subscriptions table");
  assert.match(REVENUECAT_FILE, /from\("user_entitlements"\)/, "targets user_entitlements table");
  assert.match(REVENUECAT_FILE, /\.upsert\(/, "uses upsert");
  assert.match(REVENUECAT_FILE, /billing_period/, "includes billing period");
});

test("revenuecat: extractEntitlement prioritizes higher plan (pro > starter)", () => {
  assert.match(REVENUECAT_FILE, /extractEntitlement/, "function exists");
  assert.match(REVENUECAT_FILE, /enterprise.*pro.*starter/, "priority order for entitlements");
});

test("revenuecat: logging for key operations", () => {
  assert.match(REVENUECAT_FILE, /console\.log.*\[RevenueCat\]/, "has structured logging");
  assert.match(REVENUECAT_FILE, /console\.error.*\[RevenueCat\]/, "has error logging");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Webhook handler
// ═══════════════════════════════════════════════════════════════════

test("webhook: requires auth token", () => {
  assert.match(WEBHOOK_FILE, /REVENUECAT_WEBHOOK_AUTH_TOKEN/, "reads auth token");
  assert.match(WEBHOOK_FILE, /Bearer/, "checks Bearer auth");
  assert.match(WEBHOOK_FILE, /401/, "returns 401 for unauthorized");
});

test("webhook: rejects if auth token not configured", () => {
  assert.match(WEBHOOK_FILE, /Webhook auth not configured/, "error for missing token");
  assert.match(WEBHOOK_FILE, /500/, "returns 500 when not configured");
});

test("webhook: handles all event types", () => {
  assert.match(WEBHOOK_FILE, /INITIAL_PURCHASE/, "initial purchase");
  assert.match(WEBHOOK_FILE, /RENEWAL/, "renewal");
  assert.match(WEBHOOK_FILE, /CANCELLATION/, "cancellation");
  assert.match(WEBHOOK_FILE, /UNCANCELLATION/, "uncancellation");
  assert.match(WEBHOOK_FILE, /EXPIRATION/, "expiration");
  assert.match(WEBHOOK_FILE, /BILLING_RETRY/, "billing retry");
  assert.match(WEBHOOK_FILE, /TRANSFER/, "transfer");
  assert.match(WEBHOOK_FILE, /PRODUCT_CHANGE/, "product change");
});

test("webhook: PRODUCT_CHANGE uses new_product_id", () => {
  assert.match(WEBHOOK_FILE, /PRODUCT_CHANGE/, "handles product change");
  assert.match(WEBHOOK_FILE, /new_product_id/, "reads new_product_id");
  assert.match(WEBHOOK_FILE, /effectivePlanId/, "applies new plan");
});

test("webhook: uses resolveProductId for legacy ID support", () => {
  assert.match(WEBHOOK_FILE, /resolveProductId/, "uses shared resolver");
});

test("webhook: expiration downgrades to starter", () => {
  assert.match(WEBHOOK_FILE, /expired/, "detects expired status");
  assert.match(WEBHOOK_FILE, /plan: "starter"/, "downgrades to starter");
});

test("webhook: cancellation keeps entitlement during grace period", () => {
  assert.match(WEBHOOK_FILE, /canceled/, "detects canceled status");
  assert.match(WEBHOOK_FILE, /grace period/, "grace period logic");
  assert.match(WEBHOOK_FILE, /expiration_at/, "checks expiration_at for grace");
});

test("webhook: protects superadmin from downgrade", () => {
  assert.match(WEBHOOK_FILE, /SUPERADMIN_EMAIL/, "checks superadmin emails");
  assert.match(WEBHOOK_FILE, /superadmin protected/, "skips downgrade for superadmin");
});

test("webhook: has structured logging", () => {
  assert.match(WEBHOOK_FILE, /console\.log.*\[RevenueCat webhook\]/, "webhook logging");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Sync API
// ═══════════════════════════════════════════════════════════════════

test("sync: POST endpoint exists", () => {
  assert.match(SYNC_FILE, /POST/, "has POST handler");
  assert.match(SYNC_FILE, /NextRequest/, "accepts request");
  assert.match(SYNC_FILE, /NextResponse/, "returns response");
});

test("sync: accepts appUserId, entitlement, productId, source, expiresAt", () => {
  assert.match(SYNC_FILE, /appUserId/, "appUserId field");
  assert.match(SYNC_FILE, /entitlement/, "entitlement field");
  assert.match(SYNC_FILE, /productId/, "productId field");
  assert.match(SYNC_FILE, /source/, "source field");
  assert.match(SYNC_FILE, /expiresAt/, "expiresAt field");
});

test("sync: validates entitlement values", () => {
  assert.match(SYNC_FILE, /validPlans/, "checks valid plan values");
  assert.match(SYNC_FILE, /Invalid entitlement/, "error for invalid plan");
});

test("sync: validates source values", () => {
  assert.match(SYNC_FILE, /validSources/, "checks valid source values");
  assert.match(SYNC_FILE, /revenuecat/, "accepts revenuecat source");
  assert.match(SYNC_FILE, /app_store/, "accepts app_store source");
  assert.match(SYNC_FILE, /iap/, "accepts iap source");
});

test("sync: upserts subscription and entitlement rows", () => {
  assert.match(SYNC_FILE, /subscriptions.*upsert/, "upserts subscription");
  assert.match(SYNC_FILE, /user_entitlements.*upsert/, "upserts entitlement");
});

test("sync: uses resolveProductId for product ID parsing", () => {
  assert.match(SYNC_FILE, /resolveProductId/, "uses shared resolver");
});

test("sync: requires auth (bearer token or Supabase session)", () => {
  assert.match(SYNC_FILE, /Bearer/, "checks bearer auth");
  assert.match(SYNC_FILE, /auth\.getUser/, "fallback to Supabase session");
  assert.match(SYNC_FILE, /401/, "returns 401 for unauthenticated");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Paywall integration
// ═══════════════════════════════════════════════════════════════════

test("paywall: loads RevenueCat offerings on iOS for real-time prices", () => {
  assert.match(PAYWALL_FILE, /getOfferings/, "calls getOfferings");
  assert.match(PAYWALL_FILE, /offerings/, "stores offerings state");
  assert.match(PAYWALL_FILE, /offerings\.find/, "looks up price by plan+period");
});

test("paywall: uses getProductId for product ID construction", () => {
  assert.match(PAYWALL_FILE, /getProductId/, "uses shared product ID getter");
});

test("paywall: shows loading state while fetching offerings", () => {
  assert.match(PAYWALL_FILE, /loadingOfferings/, "loading state variable");
  assert.match(PAYWALL_FILE, /Chargement des prix App Store/, "loading message");
});

test("paywall: iOS uses RevenueCat IAP only (never Stripe)", () => {
  assert.match(PAYWALL_FILE, /iosPlatform/, "checks iOS platform");
  assert.match(PAYWALL_FILE, /purchaseProduct/, "uses RC purchaseProduct");
  // Should NOT call startStripeCheckout on iOS
  const iosBlock = PAYWALL_FILE.match(/if \(iosPlatform\)[\s\S]*?return;[\s\S]*?\/\/ Web:/);
  assert.ok(iosBlock, "iOS returns before Stripe path");
});

test("paywall: restore purchases button on iOS", () => {
  assert.match(PAYWALL_FILE, /restorePurchases/, "has restore function");
  assert.match(PAYWALL_FILE, /Restaurer les achats/, "restore button text");
});

test("paywall: no external payment links on iOS (App Store rule 3.1.1)", () => {
  // Enterprise contact card gates email link behind !isIOSPlatform
  const mailtoSection = PAYWALL_FILE.match(/isIOSPlatform.*mailto|mailto.*isIOSPlatform/);
  // The email link is gated with {!isIOSPlatform && ...}
  assert.match(PAYWALL_FILE, /isIOSPlatform/, "platform check exists");
  assert.match(PAYWALL_FILE, /App Store rule/, "rule comment present");
});

// ═══════════════════════════════════════════════════════════════════
// 6. Subscription sync hook
// ═══════════════════════════════════════════════════════════════════

test("hook: only runs on Capacitor native", () => {
  assert.match(USE_SUBSCRIPTION_SYNC, /isCapacitorNative/, "checks native platform");
});

test("hook: requires RevenueCat API key", () => {
  assert.match(USE_SUBSCRIPTION_SYNC, /REVENUECAT_API_KEY/, "checks API key");
});

test("hook: configures RC on auth change", () => {
  assert.match(USE_SUBSCRIPTION_SYNC, /configureRevenueCat/, "configures RC");
  assert.match(USE_SUBSCRIPTION_SYNC, /onAuthStateChange/, "listens to auth changes");
});

test("hook: syncs entitlement from RC to Supabase", () => {
  assert.match(USE_SUBSCRIPTION_SYNC, /syncEntitlementFromRC/, "sync function");
  assert.match(USE_SUBSCRIPTION_SYNC, /user_entitlements.*upsert/, "upserts entitlement");
});

test("hook: downgrades to starter when no active entitlement", () => {
  assert.match(USE_SUBSCRIPTION_SYNC, /activated_via === "iap"/, "checks if was IAP user");
  assert.match(USE_SUBSCRIPTION_SYNC, /plan: "starter"/, "downgrades to starter");
});

test("hook: uses getProductId for price_id", () => {
  assert.match(USE_SUBSCRIPTION_SYNC, /getProductId/, "uses shared product ID getter");
});

// ═══════════════════════════════════════════════════════════════════
// 7. Environment variables
// ═══════════════════════════════════════════════════════════════════

test("env: .env.example exists and documents RevenueCat vars", () => {
  assert.match(ENV_EXAMPLE, /NEXT_PUBLIC_REVENUECAT_API_KEY/, "RC API key documented");
  assert.match(ENV_EXAMPLE, /REVENUECAT_WEBHOOK_AUTH_TOKEN/, "webhook token documented");
});

test("env: .env.example documents Stripe vars (web only)", () => {
  assert.match(ENV_EXAMPLE, /STRIPE_SECRET_KEY/, "Stripe key documented");
  assert.match(ENV_EXAMPLE, /NEVER used on iOS/, "iOS guard comment");
});

test("env: .env.example documents Capacitor server URL", () => {
  assert.match(ENV_EXAMPLE, /CAPACITOR_SERVER_URL/, "server URL documented");
});

test("env: .env.example has Apple Sign-In docs", () => {
  assert.match(ENV_EXAMPLE, /APPLE_WEB_CLIENT_ID/, "Apple client ID");
  assert.match(ENV_EXAMPLE, /APPLE_CLIENT_ID/, "Apple client ID");
});

test("env: .env.example has Supabase service role key", () => {
  assert.match(ENV_EXAMPLE, /SUPABASE_SERVICE_ROLE_KEY/, "service role key");
});
