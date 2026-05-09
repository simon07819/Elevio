/**
 * App Store compliance tests.
 *
 * Verifies Elevio iOS app meets Apple review guidelines:
 * - Zero Stripe on iOS
 * - Zero external payment links on iOS
 * - RevenueCat IAP only on iOS
 * - QR is homepage, no paywall at launch
 * - Passenger flow never blocked
 * - Server-side Stripe guard
 * - NSCameraUsageDescription present
 * - No unnecessary permissions
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const PLATFORM = readFileSync(join(root, "lib/platform.ts"), "utf8");
const CHECKOUT = readFileSync(join(root, "lib/billing/checkout.ts"), "utf8");
const REVENUECAT = readFileSync(join(root, "lib/billing/revenuecat.ts"), "utf8");
const PAYWALL_CLIENT = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const APP_PRICING = readFileSync(join(root, "components/mobile/AppPricingScreen.tsx"), "utf8");
const WELCOME_SCREEN = readFileSync(join(root, "components/mobile/WelcomeScreen.tsx"), "utf8");
const REQUEST_FORM = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
const SCAN_HOME = readFileSync(join(root, "components/ScanHome.tsx"), "utf8");
const HOME_PAGE = readFileSync(join(root, "app/page.tsx"), "utf8");
const INFO_PLIST = readFileSync(join(root, "ios/App/App/Info.plist"), "utf8");
const CAPACITOR_CONFIG = readFileSync(join(root, "capacitor.config.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. iOS shows ZERO Stripe
// ═══════════════════════════════════════════════════════════════════

test("appstore: AppPricingScreen has no Stripe imports", () => {
  assert.doesNotMatch(APP_PRICING, /createStripeCheckout|stripe|Stripe/, "no Stripe in AppPricingScreen");
});

test("appstore: AppPricingScreen uses RevenueCat purchaseProduct", () => {
  assert.match(APP_PRICING, /purchaseProduct/, "uses RevenueCat IAP");
  assert.match(APP_PRICING, /isIOS/, "checks iOS platform");
});

test("appstore: WelcomeScreen has no payment/billing references", () => {
  assert.doesNotMatch(WELCOME_SCREEN, /paywall|Stripe|checkout|billing|plan/i, "no billing in welcome screen");
});

// ═══════════════════════════════════════════════════════════════════
// 2. iOS checkout blocked (Stripe)
// ═══════════════════════════════════════════════════════════════════

test("appstore: checkout.ts has iOS guard (isIOS param)", () => {
  assert.match(CHECKOUT, /isIOS/, "checks isIOS parameter");
  assert.match(CHECKOUT, /App Store uniquement/, "returns App Store error message");
});

test("appstore: checkout.ts has server-side iOS guard (User-Agent)", () => {
  assert.match(CHECKOUT, /isRequestFromIOS/, "server-side iOS detection function");
  assert.match(CHECKOUT, /user-agent/i, "checks User-Agent header");
});

test("appstore: both checkout and billing portal block iOS", () => {
  assert.match(CHECKOUT, /createStripeCheckout[\s\S]*?isRequestFromIOS/, "checkout has server iOS guard");
  assert.match(CHECKOUT, /createStripeBillingPortal[\s\S]*?isRequestFromIOS/, "billing portal has server iOS guard");
});

test("appstore: PaywallClient never calls Stripe on iOS", () => {
  // The handleSubscribe function has `if (iosPlatform)` early return
  assert.match(PAYWALL_CLIENT, /iosPlatform/, "checks iOS platform");
  assert.match(PAYWALL_CLIENT, /iOS: RevenueCat IAP ONLY/, "explicit comment about iOS-only IAP");
});

// ═══════════════════════════════════════════════════════════════════
// 3. No external payment links on iOS
// ═══════════════════════════════════════════════════════════════════

test("appstore: PaywallClient hides mailto link on iOS", () => {
  assert.match(PAYWALL_CLIENT, /!isIOSPlatform/, "conditionally hides external link");
  assert.match(PAYWALL_CLIENT, /mailto/, "has mailto link for web");
});

test("appstore: PaywallClient hides external text on iOS", () => {
  assert.match(PAYWALL_CLIENT, /App Store rule/, "App Store compliance comment");
  // The "no card required" text is hidden behind !iosPlatform
  assert.match(PAYWALL_CLIENT, /iosPlatform/, "uses iosPlatform guard");
});

test("appstore: AppPricingScreen has no external payment links", () => {
  assert.doesNotMatch(APP_PRICING, /mailto:/, "no mailto links");
  assert.doesNotMatch(APP_PRICING, /stripe/i, "no Stripe references");
  // Check there's no rendered text pointing to external payment (only a code comment exists)
  assert.doesNotMatch(APP_PRICING, /href=.*paywall/, "no paywall href links");
});

// ═══════════════════════════════════════════════════════════════════
// 4. QR is homepage, no paywall at launch
// ═══════════════════════════════════════════════════════════════════

test("appstore: / renders ScanHome directly (no redirect, no landing)", () => {
  assert.match(HOME_PAGE, /ScanHome/, "renders ScanHome");
  assert.match(HOME_PAGE, /return.*ScanHome/, "returns ScanHome directly");
  assert.doesNotMatch(HOME_PAGE, /from "next\/navigation"/, "no next/navigation import (no server redirect)");
});

test("appstore: ScanHome renders passenger QR directly with mounted fallback (no redirect, no paywall)", () => {
  assert.match(SCAN_HOME, /mounted/, "has mounted state for hydration safety");
  assert.doesNotMatch(SCAN_HOME, /WelcomeScreen/, "no WelcomeScreen inline — passenger sees QR scan directly");
  assert.doesNotMatch(SCAN_HOME, /router\.replace\("\/welcome"\)/, "does NOT redirect to /welcome (would loop)");
  assert.doesNotMatch(SCAN_HOME, /\/paywall/, "does NOT redirect to paywall");
});

test("appstore: WelcomeScreen has no paywall reference", () => {
  assert.doesNotMatch(WELCOME_SCREEN, /paywall/i, "no paywall in welcome");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Passenger flow never blocked
// ═══════════════════════════════════════════════════════════════════

test("appstore: RequestForm (passenger) has zero billing references", () => {
  assert.doesNotMatch(REQUEST_FORM, /paywall|billing|plan|upgrade|entitlement|stripe/i, "no billing in passenger form");
});

test("appstore: ScanHome (passenger entry) has zero billing references", () => {
  assert.doesNotMatch(SCAN_HOME, /paywall|billing|upgrade|entitlement|stripe/i, "no billing in scan home");
});

// ═══════════════════════════════════════════════════════════════════
// 6. Platform detection is reliable
// ═══════════════════════════════════════════════════════════════════

test("appstore: isCapacitorNative checks Capacitor.isNativePlatform", () => {
  assert.match(PLATFORM, /isNativePlatform/, "checks Capacitor.isNativePlatform");
});

test("appstore: isIOS checks Capacitor.getPlatform === ios", () => {
  assert.match(PLATFORM, /getPlatform/, "uses Capacitor.getPlatform");
  assert.match(PLATFORM, /=== "ios"/, "checks for ios platform");
});

test("appstore: assertNotIOS throws on iOS for Stripe actions", () => {
  assert.match(PLATFORM, /assertNotIOS/, "assertNotIOS function exists");
  assert.match(PLATFORM, /external payments not allowed on iOS/, "clear error message");
});

// ═══════════════════════════════════════════════════════════════════
// 7. RevenueCat configured for iOS
// ═══════════════════════════════════════════════════════════════════

test("appstore: RevenueCat uses Purchases SDK on native", () => {
  assert.match(REVENUECAT, /@revenuecat\/purchases-capacitor/, "imports RevenueCat SDK");
  assert.match(REVENUECAT, /Purchases\.configure/, "configures SDK");
});

test("appstore: RevenueCat purchaseProduct requires native platform", () => {
  assert.match(REVENUECAT, /isNativePlatform/, "checks native platform before purchase");
  assert.match(REVENUECAT, /ok: false/, "returns error on web");
});

test("appstore: RevenueCat syncs entitlements to Supabase after purchase", () => {
  assert.match(REVENUECAT, /syncEntitlementToSupabase/, "sync function exists");
  assert.match(REVENUECAT, /user_entitlements/, "writes to entitlements table");
});

test("appstore: RevenueCat has restorePurchases for App Store requirement", () => {
  assert.match(REVENUECAT, /restorePurchases/, "restore function exists");
});

// ═══════════════════════════════════════════════════════════════════
// 8. Capacitor config correct
// ═══════════════════════════════════════════════════════════════════

test("appstore: Capacitor bundle ID is com.elevio.app", () => {
  assert.match(CAPACITOR_CONFIG, /com\.elevio\.app/, "correct bundle ID");
});

test("appstore: Capacitor app name is Elevio", () => {
  assert.match(CAPACITOR_CONFIG, /Elevio/, "correct app name");
});

test("appstore: Capacitor uses https scheme (default in Capacitor 8)", () => {
  // Capacitor 8 defaults to https scheme — no explicit config needed
  const CAPACITOR_CONFIG = readFileSync(join(root, "capacitor.config.ts"), "utf8");
  assert.ok(!CAPACITOR_CONFIG.includes("androidScheme: 'http'"), "does NOT use http scheme");
  // Default is https per Capacitor 8 docs
});

// ═══════════════════════════════════════════════════════════════════
// 9. Info.plist compliance
// ═══════════════════════════════════════════════════════════════════

test("appstore: Info.plist has NSCameraUsageDescription for QR scanning", () => {
  assert.match(INFO_PLIST, /NSCameraUsageDescription/, "camera usage description exists");
  assert.match(INFO_PLIST, /QR/, "mentions QR scanning purpose");
});

test("appstore: Info.plist has no unnecessary privacy permissions", () => {
  assert.doesNotMatch(INFO_PLIST, /NSLocationWhenInUseUsageDescription/, "no location permission");
  assert.doesNotMatch(INFO_PLIST, /NSPhotoLibraryUsageDescription/, "no photo library permission");
  assert.doesNotMatch(INFO_PLIST, /NSMicrophoneUsageDescription/, "no microphone permission");
  assert.doesNotMatch(INFO_PLIST, /NSContactsUsageDescription/, "no contacts permission");
  assert.doesNotMatch(INFO_PLIST, /NSBluetoothAlwaysUsageDescription/, "no Bluetooth permission");
});

test("appstore: Info.plist display name is Elevio", () => {
  assert.match(INFO_PLIST, /CFBundleDisplayName/, "has display name key");
  assert.match(INFO_PLIST, /Elevio/, "display name is Elevio");
});

test("appstore: Info.plist requires iPhone (not just iPad)", () => {
  assert.match(INFO_PLIST, /LSRequiresIPhoneOS/, "supports iPhone");
});

// ═══════════════════════════════════════════════════════════════════
// 10. Pricing consistency ($199 / $499)
// ═══════════════════════════════════════════════════════════════════

test("appstore: All UIs show consistent pricing ($199/$499)", () => {
  const PLANS_TS = readFileSync(join(root, "lib/billing/plans.ts"), "utf8");
  assert.match(PLANS_TS, /priceMonthly: 199/, "Starter $199/mo");
  assert.match(PLANS_TS, /priceMonthly: 499/, "Pro $499/mo");
});

test("appstore: AppPricingScreen shows correct prices", () => {
  assert.match(APP_PRICING, /199 \$|199\$/, "shows $199 for Starter");
  assert.match(APP_PRICING, /499 \$|499\$/, "shows $499 for Pro");
});

// ═══════════════════════════════════════════════════════════════════
// 11. Security audit — targeted fixes
// ═══════════════════════════════════════════════════════════════════

test("security: revenuecat/sync rejects appUserId mismatch (impersonation)", () => {
  const SYNC_ROUTE = readFileSync(join(root, "app/api/revenuecat/sync/route.ts"), "utf8");
  assert.match(SYNC_ROUTE, /appUserId mismatch/, "returns 403 on mismatch");
  assert.match(SYNC_ROUTE, /status: 403/, "status 403 for impersonation");
});

test("security: revenuecat/webhook protects superadmins from downgrade", () => {
  const WEBHOOK_ROUTE = readFileSync(join(root, "app/api/revenuecat/webhook/route.ts"), "utf8");
  assert.match(WEBHOOK_ROUTE, /EXPIRATION.*CANCELLATION|CANCELLATION.*EXPIRATION/, "checks downgrade events");
  assert.match(WEBHOOK_ROUTE, /superadmin protected/, "skips downgrade for superadmin");
  // Must NOT call supabase.auth.getUser() in webhook — no session available
  // Strip comments before checking to avoid false positives
  const webhookCode = WEBHOOK_ROUTE.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(webhookCode, /auth\.getUser\(\)/, "no auth.getUser call in webhook code");
  // Must use profiles table instead
  assert.match(WEBHOOK_ROUTE, /from\("profiles"\)/, "uses profiles table for superadmin check");
});

test("security: auth/callback blocks open redirects", () => {
  const AUTH_CALLBACK = readFileSync(join(root, "app/auth/callback/route.ts"), "utf8");
  assert.match(AUTH_CALLBACK, /startsWith\("\/"\)/, "only allows paths starting with /");
  assert.match(AUTH_CALLBACK, /startsWith\("\/\/"\)/, "blocks protocol-relative URLs");
  assert.match(AUTH_CALLBACK, /parsed\.origin/, "validates origin matches");
  assert.match(AUTH_CALLBACK, /safeNext|\/paywall/, "falls back to safe internal path");
});

test("security: force-release verifies project membership", () => {
  const FORCE_RELEASE = readFileSync(join(root, "app/api/operator/force-release/route.ts"), "utf8");
  assert.match(FORCE_RELEASE, /owner_id/, "checks project ownership");
  assert.match(FORCE_RELEASE, /status: 403/, "returns 403 for unauthorized project");
  assert.match(FORCE_RELEASE, /isSuperadmin/, "superadmin bypasses project check");
});

test("security: error boundaries exist for app, operator, request", () => {
  const APP_ERROR = readFileSync(join(root, "app/error.tsx"), "utf8");
  const OP_ERROR = readFileSync(join(root, "app/operator/error.tsx"), "utf8");
  const REQ_ERROR = readFileSync(join(root, "app/request/error.tsx"), "utf8");
  for (const [name, content] of [["app", APP_ERROR], ["operator", OP_ERROR], ["request", REQ_ERROR]]) {
    assert.match(content, /use client/, `${name} error is client component`);
    assert.match(content, /reset/, `${name} error has retry button`);
    assert.match(content, /Link/, `${name} error uses Next Link for navigation`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// 12. Apple Sign-In button only on native iOS
// ═══════════════════════════════════════════════════════════════════

test("appstore: Apple Sign-In button gated by isCapacitorNative", () => {
  const WELCOME = readFileSync(join(root, "components/mobile/WelcomeScreen.tsx"), "utf8");
  const LOGIN = readFileSync(join(root, "components/admin/AdminLoginForm.tsx"), "utf8");
  // Both must import isCapacitorNative
  assert.match(WELCOME, /isCapacitorNative/, "WelcomeScreen imports isCapacitorNative");
  assert.match(LOGIN, /isCapacitorNative/, "AdminLoginForm imports isCapacitorNative");
  // Apple button wrapped in isNative condition
  assert.match(WELCOME, /isNative/, "WelcomeScreen checks isNative before Apple button");
  assert.match(LOGIN, /isNative/, "AdminLoginForm checks isNative before Apple button");
});
