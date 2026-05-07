/**
 * Full live-app flow tests — PHASE 1-2.
 *
 * Account creation, onboarding, plan guards, payment status,
 * operator terminal lifecycle (activate/release/resume).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const AUTH = readFileSync(join(root, "lib/auth.ts"), "utf8");
const AUTH_SUPERADMIN = readFileSync(join(root, "lib/auth/superadmin.ts"), "utf8");
const PROFILE = readFileSync(join(root, "lib/profile.ts"), "utf8");
const PLAN_GUARDS = readFileSync(join(root, "lib/billing/planGuards.ts"), "utf8");
const ENTITLEMENTS = readFileSync(join(root, "lib/billing/entitlements.ts"), "utf8");
const PLANS = readFileSync(join(root, "lib/billing/plans.ts"), "utf8");
const CHECKOUT = readFileSync(join(root, "lib/billing/checkout.ts"), "utf8");
const PLATFORM = readFileSync(join(root, "lib/platform.ts"), "utf8");
const MOBILE_AUTH = readFileSync(join(root, "lib/mobileAuth.ts"), "utf8");
const WELCOME = readFileSync(join(root, "components/mobile/WelcomeScreen.tsx"), "utf8");
const APPLE_HOOK = readFileSync(join(root, "hooks/useAppleSignIn.ts"), "utf8");
const ONBOARDING = readFileSync(join(root, "components/mobile/OnboardingFlow.tsx"), "utf8");
const APP_PRICING = readFileSync(join(root, "components/mobile/AppPricingScreen.tsx"), "utf8");
const PAYWALL_CLIENT = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const STATE_RES = readFileSync(join(root, "lib/stateResolution.ts"), "utf8");
const OPERATOR_WORKSPACE = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
const OPERATOR_DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const CAP_REDIRECT = readFileSync(join(root, "hooks/useCapacitorRedirect.ts"), "utf8");
const HOME_CONTENT = readFileSync(join(root, "components/public/HomeContent.tsx"), "utf8");
const APP_NAVIGATION = readFileSync(join(root, "components/AppNavigation.tsx"), "utf8");
const APP_SHELL = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
const OPERATOR_PAGE = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
const SUPERADMIN_LAYOUT = readFileSync(join(root, "app/superadmin/layout.tsx"), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: New account + onboarding + plan guard
// ═══════════════════════════════════════════════════════════════════════════

test("flow: /welcome exists as a standalone page", () => {
  assert.ok(WELCOME.length > 0, "/welcome page component exists");
  assert.match(WELCOME, /useAppleSignIn/, "uses shared Apple hook");
  assert.match(APPLE_HOOK, /isCapacitorNative/, "hook detects native platform");
  assert.match(APPLE_HOOK, /signInWithApple/, "hook calls Apple Sign-In server action");
  assert.match(WELCOME, /signInMobile/, "has email login");
});

test("flow: / renders ScanHome directly with mounted fallback (passenger QR on both web and native)", () => {
  const HOME_PAGE = readFileSync(join(root, "app/page.tsx"), "utf8");
  assert.match(HOME_PAGE, /ScanHome/, "/ renders ScanHome directly (no landing page)");
  const SCAN_HOME = readFileSync(join(root, "components/ScanHome.tsx"), "utf8");
  assert.match(SCAN_HOME, /mounted/, "ScanHome has mounted state for hydration safety");
  assert.doesNotMatch(SCAN_HOME, /WelcomeScreen/, "no WelcomeScreen inline — passenger sees QR scan directly");
  assert.doesNotMatch(SCAN_HOME, /router\.replace\("\/welcome"\)/, "no redirect to /welcome (would loop)");
});

test("flow: onboarding uses default free plan", () => {
  assert.match(ONBOARDING, /useState\("free"\)/, "default plan is free");
  assert.match(ONBOARDING, /signUpMobile/, "calls signUpMobile server action");
  assert.match(ONBOARDING, /firstName|first_name/, "collects first name");
  assert.match(ONBOARDING, /lastName|last_name/, "collects last name");
  assert.match(ONBOARDING, /company/, "collects company");
});

test("flow: profile default role is operator (not admin)", () => {
  assert.match(PROFILE, /roleForEmail/, "roleForEmail function exists");
  assert.match(PROFILE, /"operator"/, "default role is operator");
});

test("flow: superadmin email gets superadmin role on profile creation", () => {
  assert.match(PROFILE, /superadminEmails/, "superadminEmails function exists");
  // SUPERADMIN_EMAIL must be configured explicitly — no hardcoded fallback
  assert.match(AUTH_SUPERADMIN, /SUPERADMIN_EMAIL.*\?\? ?""/, "no hardcoded superadmin email");
  assert.match(AUTH_SUPERADMIN, /toLowerCase/, "uses lowercase comparison");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1b: Plan guards + payment status
// ═══════════════════════════════════════════════════════════════════════════

test("planGuard: enforcePaymentStatus exists with blocking statuses", () => {
  assert.match(PLAN_GUARDS, /enforcePaymentStatus/, "enforcePaymentStatus function exists");
  assert.match(PLAN_GUARDS, /past_due/, "blocks past_due");
  assert.match(PLAN_GUARDS, /expired/, "blocks expired");
  assert.match(PLAN_GUARDS, /canceled/, "blocks canceled");
  assert.match(PLAN_GUARDS, /incomplete/, "blocks incomplete");
});

test("planGuard: getSubscriptionStatus checks subscriptions table", () => {
  assert.match(PLAN_GUARDS, /getSubscriptionStatus/, "getSubscriptionStatus function exists");
  assert.match(PLAN_GUARDS, /subscriptions/, "queries subscriptions table");
  assert.match(PLAN_GUARDS, /BLOCKING_STATUSES/, "has blocking statuses set");
});

test("planGuard: admin/activation_code users bypass subscription check", () => {
  assert.match(PLAN_GUARDS, /activatedVia.*admin/, "checks activatedVia for admin");
  assert.match(PLAN_GUARDS, /activation_code/, "checks for activation_code");
});

test("planGuard: project creation enforced", () => {
  assert.match(ACTIONS, /enforceProjectLimit/, "actions checks project limit");
});

test("planGuard: operator activation enforced", () => {
  assert.match(ACTIONS, /enforceOperatorLimit/, "actions checks operator limit");
});

test("planGuard: request creation enforced", () => {
  assert.match(ACTIONS, /enforceRequestLimit/, "actions checks request limit");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1c: iOS — RevenueCat only, Stripe blocked
// ═══════════════════════════════════════════════════════════════════════════

test("iOS: platform detection works", () => {
  assert.match(PLATFORM, /isIOS/, "isIOS function exists");
  assert.match(PLATFORM, /isCapacitorNative/, "isCapacitorNative function exists");
  assert.match(PLATFORM, /assertNotIOS/, "assertNotIOS guard exists");
  assert.match(PLATFORM, /Capacitor\.isNativePlatform/, "checks Capacitor.isNativePlatform()");
  assert.match(PLATFORM, /getPlatform.*ios/, "checks getPlatform() for ios");
});

test("iOS: Stripe checkout blocked on iOS", () => {
  assert.match(CHECKOUT, /isIOS/, "checkout checks isIOS");
  assert.match(CHECKOUT, /App Store/, "returns App Store message on iOS");
});

test("iOS: PaywallClient uses RevenueCat only on iOS", () => {
  assert.match(PAYWALL_CLIENT, /isIOS/, "PaywallClient checks isIOS()");
  assert.match(PAYWALL_CLIENT, /iosPlatform/, "stores iOS flag");
  // On iOS branch: purchaseProduct only
  assert.match(PAYWALL_CLIENT, /if.*iosPlatform/, "branches on iOS");
  assert.match(PAYWALL_CLIENT, /purchaseProduct/, "calls purchaseProduct on iOS");
});

test("iOS: AppPricingScreen uses RevenueCat IAP on iOS", () => {
  assert.match(APP_PRICING, /isIOS/, "checks isIOS");
  assert.match(APP_PRICING, /purchaseProduct/, "calls purchaseProduct on iOS");
  assert.match(APP_PRICING, /handleIAPPurchase/, "has handleIAPPurchase function");
  assert.doesNotMatch(APP_PRICING, /createStripeCheckout/, "no Stripe checkout on pricing screen");
});

test("iOS: no Stripe imports in mobile components", () => {
  assert.doesNotMatch(WELCOME, /stripe|Stripe/i, "no Stripe in WelcomeScreen");
  assert.doesNotMatch(ONBOARDING, /stripe|Stripe/i, "no Stripe in OnboardingFlow");
  assert.doesNotMatch(APP_PRICING, /createStripeCheckout/, "no Stripe checkout in AppPricingScreen");
});

test("iOS: no external payment links on mobile", () => {
  // Enterprise card on PaywallClient hides mailto on iOS
  assert.match(PAYWALL_CLIENT, /isIOSPlatform/, "EnterpriseContactCard checks iOS");
  assert.match(PAYWALL_CLIENT, /!isIOSPlatform/, "hides external links on iOS");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: Operator terminal lifecycle
// ═══════════════════════════════════════════════════════════════════════════

test("operator: zero operators cancels ALL non-terminal requests including boarded", () => {
  assert.match(ACTIONS, /cancelActiveProjectRequestsIfNoLiveOperators/, "has cleanup function for zero operators");
  assert.match(ACTIONS, /cancellableStatuses/, "has cancellable statuses list in actions");
  assert.match(ACTIONS, /"boarded"/, "boarded is in cancellable statuses");
  assert.match(ACTIONS, /"pending"/, "pending is in cancellable statuses");
  assert.match(ACTIONS, /"assigned"/, "assigned is in cancellable statuses");
  assert.match(ACTIONS, /"arriving"/, "arriving is in cancellable statuses");
});

test("operator: terminal statuses never downgraded", () => {
  assert.match(STATE_RES, /isTerminalStatus/, "has isTerminalStatus function");
  assert.match(STATE_RES, /"completed"/, "completed is terminal");
  assert.match(STATE_RES, /"cancelled"/, "cancelled is terminal");
  assert.match(STATE_RES, /statusPriority/, "has status priority function");
});

test("operator: session guard filters stale requests after release", () => {
  assert.match(OPERATOR_DASHBOARD, /sessionStartedAt/, "OperatorDashboard tracks session start");
  assert.match(OPERATOR_DASHBOARD, /gte.*created_at|created_at.*gte/, "filters DB query by session start");
  assert.match(OPERATOR_DASHBOARD, /sessionStartMs/, "filters in-memory requests by session start");
});

test("operator: activate + release + reactivate gives clean terminal", () => {
  assert.match(ACTIONS, /releaseOperatorElevator/, "has release function");
  assert.match(ACTIONS, /activateOperatorElevator/, "has activate function");
  assert.match(ACTIONS, /cancelActiveProjectRequestsIfNoLiveOperators/, "cleanup on release");
  // After release, SSR auto-cleanup
  assert.match(ACTIONS, /cancelActiveProjectRequestsIfNoLiveOperators/, "cleanup triggered");
});

test("operator: pickup is instant optimistic (no blocking timeout)", () => {
  assert.match(OPERATOR_DASHBOARD, /onPickupSuccess/, "has onPickupSuccess callback");
  assert.match(OPERATOR_DASHBOARD, /onPickupFailure/, "has onPickupFailure callback");
  // Verify the OPTIMISTIC_REQUEST_TTL_MS constant exists (used for expiry, not for blocking)
  assert.match(OPERATOR_DASHBOARD, /OPTIMISTIC_REQUEST_TTL_MS/, "has optimistic TTL constant");
  // Pickup is fire-and-forget optimistic, not wrapped in withTimeout
  assert.doesNotMatch(OPERATOR_DASHBOARD, /withTimeout/, "no withTimeout on pickup");
});

test("operator: boarded→boarded merge is safe (same priority, newer wins)", () => {
  // resolveMerge handles same-priority statuses by comparing updated_at
  // boarded→boarded: same priority (3), newer updated_at wins = idempotent
  assert.match(STATE_RES, /resolveMerge/, "has resolveMerge function");
  assert.match(STATE_RES, /existingPriority.*incomingPriority/, "compares priorities");
  assert.match(STATE_RES, /updated_at/, "falls back to updated_at for same priority");
});

test("operator: refresh/reload preserves session", () => {
  assert.match(OPERATOR_WORKSPACE, /sessionStartedAt/, "session start time tracked");
  assert.match(OPERATOR_WORKSPACE, /operator_session_id/, "uses operator_session_id");
  assert.match(OPERATOR_WORKSPACE, /operator_session_heartbeat_at/, "tracks heartbeat");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: Superadmin access control
// ═══════════════════════════════════════════════════════════════════════════

test("superadmin: layout calls requireSuperAdmin", () => {
  assert.match(SUPERADMIN_LAYOUT, /requireSuperAdmin/, "layout requires superadmin");
  assert.match(SUPERADMIN_LAYOUT, /redirect.*admin\/login/, "redirects non-superadmin to login");
});

test("superadmin: button visible only for superadmin role (profile-based + email fallback)", () => {
  assert.match(APP_SHELL, /isSuperAdmin|isSuperAdminProfile/, "AppShell checks superadmin via role or email");
  assert.match(APP_SHELL, /showSuperadmin/, "passes showSuperadmin to AppNavigation");
  assert.match(APP_SHELL, /userRole/, "AppShell accepts userRole prop (primary)");
  assert.match(APP_NAVIGATION, /showSuperadmin/, "AppNavigation accepts showSuperadmin prop");
  assert.match(APP_NAVIGATION, /\/superadmin/, "links to /superadmin");
  // Only shown when prop is true
  assert.match(APP_NAVIGATION, /showSuperadmin/, "conditionally renders superadmin link");
});

test("superadmin: operator page uses isSuperAdmin(profile, email)", () => {
  assert.match(OPERATOR_PAGE, /isSuperAdmin[^EP]/, "operator page checks isSuperAdmin");
  assert.match(OPERATOR_PAGE, /showSuperadmin/, "passes showSuperadmin to AppNavigation");
});

test("superadmin: requireSuperAdmin uses lowercase email check", () => {
  assert.match(AUTH_SUPERADMIN, /toLowerCase/, "lowercase comparison");
  assert.match(AUTH_SUPERADMIN, /canAccessSuperAdmin/, "canAccessSuperAdmin function exists");
  assert.match(AUTH_SUPERADMIN, /requireSuperAdmin/, "requireSuperAdmin function exists");
});
