/**
 * Mobile app entry flow tests.
 *
 * Verifies:
 * - Welcome screen exists at /welcome
 * - Onboarding flow at /onboarding
 * - In-app pricing at /app-pricing
 * - Mobile auth abstraction exists (signInWithApple mock)
 * - / redirects to /scan (QR scan page)
 * - /pricing unchanged
 * - /operator unchanged
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const WELCOME = readFileSync(join(root, "app/welcome/page.tsx"), "utf8");
const WELCOME_SCREEN = readFileSync(join(root, "components/mobile/WelcomeScreen.tsx"), "utf8");
const APPLE_HOOK = readFileSync(join(root, "hooks/useAppleSignIn.ts"), "utf8");
const ONBOARDING = readFileSync(join(root, "app/onboarding/page.tsx"), "utf8");
const ONBOARDING_FLOW = readFileSync(join(root, "components/mobile/OnboardingFlow.tsx"), "utf8");
const APP_PRICING = readFileSync(join(root, "app/app-pricing/page.tsx"), "utf8");
const APP_PRICING_SCREEN = readFileSync(join(root, "components/mobile/AppPricingScreen.tsx"), "utf8");
const MOBILE_AUTH = readFileSync(join(root, "lib/mobileAuth.ts"), "utf8");
const HOME = readFileSync(join(root, "app/page.tsx"), "utf8");
const HOME_CONTENT = readFileSync(join(root, "components/public/HomeContent.tsx"), "utf8");
const WEB_PRICING = readFileSync(join(root, "app/pricing/page.tsx"), "utf8");
const OPERATOR = readFileSync(join(root, "app/operator/page.tsx"), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// 1. Welcome screen at /welcome
// ═══════════════════════════════════════════════════════════════════════════
test("mobile: /welcome page exists", () => {
  assert.match(WELCOME, /WelcomeScreen/, "WelcomeScreen imported");
});

test("mobile: welcome has Apple sign-in button", () => {
  assert.match(WELCOME_SCREEN, /Continuer avec Apple/, "Apple button text");
  assert.match(WELCOME_SCREEN, /Apple/, "Apple icon");
});

test("mobile: welcome uses Capawesome Apple Sign-In plugin (Capacitor 8)", () => {
  assert.match(APPLE_HOOK, /@capawesome\/capacitor-apple-sign-in/, "imports Capawesome plugin");
  assert.match(APPLE_HOOK, /AppleSignIn\.signIn/, "calls AppleSignIn.signIn()");
  assert.match(APPLE_HOOK, /SignInScope/, "uses SignInScope enum");
  assert.match(APPLE_HOOK, /idToken/, "extracts idToken from result");
  assert.doesNotMatch(WELCOME_SCREEN, /@capawesome\/capacitor-apple-sign-in/, "no static import in WelcomeScreen");
});

test("mobile: welcome detects Capacitor native vs web", () => {
  assert.match(APPLE_HOOK, /isCapacitorNative/, "hook uses native detection function");
  const PLATFORM = readFileSync(join(root, "lib/platform.ts"), "utf-8");
  assert.match(PLATFORM, /Capacitor\.isNativePlatform/, "platform module checks Capacitor.isNativePlatform()");
});

test("mobile: welcome sends idToken to signInWithApple server action", () => {
  assert.match(APPLE_HOOK, /signInWithApple\(idToken/, "passes idToken to server action");
  assert.match(APPLE_HOOK, /givenName|familyName/, "passes name from Apple response");
});

test("mobile: welcome handles Apple cancellation gracefully", () => {
  assert.match(APPLE_HOOK, /cancel|CANCELED|SIGN_IN_CANCELED/, "handles user cancellation");
});

test("mobile: welcome has email sign-in", () => {
  assert.match(WELCOME_SCREEN, /Se connecter/, "email sign-in button");
  assert.match(WELCOME_SCREEN, /signInMobile/, "calls signInMobile");
});

test("mobile: welcome links to onboarding and pricing", () => {
  assert.match(WELCOME_SCREEN, /\/onboarding/, "link to onboarding");
  assert.match(WELCOME_SCREEN, /\/app-pricing/, "link to in-app pricing");
});

test("mobile: welcome has operator/passager/admin shortcuts", () => {
  assert.match(WELCOME_SCREEN, /\/operator/, "operator shortcut");
  assert.match(WELCOME_SCREEN, /\/scan/, "passenger shortcut");
  assert.match(WELCOME_SCREEN, /\/admin/, "admin shortcut");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Onboarding flow at /onboarding
// ═══════════════════════════════════════════════════════════════════════════
test("mobile: /onboarding page exists", () => {
  assert.match(ONBOARDING, /OnboardingFlow/, "OnboardingFlow imported");
});

test("mobile: onboarding has 4 steps: account, company, role, plan", () => {
  assert.match(ONBOARDING_FLOW, /"account"/, "account step");
  assert.match(ONBOARDING_FLOW, /"company"/, "company step");
  assert.match(ONBOARDING_FLOW, /"role"/, "role step");
  assert.match(ONBOARDING_FLOW, /"plan"/, "plan step");
});

test("mobile: onboarding collects firstName, lastName, email, password", () => {
  assert.match(ONBOARDING_FLOW, /firstName/, "firstName field");
  assert.match(ONBOARDING_FLOW, /lastName/, "lastName field");
  assert.match(ONBOARDING_FLOW, /email/, "email field");
  assert.match(ONBOARDING_FLOW, /password/, "password field");
});

test("mobile: onboarding collects company, phone, siteCount", () => {
  assert.match(ONBOARDING_FLOW, /company/, "company field");
  assert.match(ONBOARDING_FLOW, /phone/, "phone field");
  assert.match(ONBOARDING_FLOW, /siteCount/, "siteCount field");
});

test("mobile: onboarding has 3 roles: owner, admin, operator", () => {
  assert.match(ONBOARDING_FLOW, /"owner"/, "owner role");
  assert.match(ONBOARDING_FLOW, /"admin"/, "admin role");
  assert.match(ONBOARDING_FLOW, /"operator"/, "operator role");
});

test("mobile: onboarding has 4 plans including free option", () => {
  assert.match(ONBOARDING_FLOW, /id: "free"/, "free plan available in onboarding");
  assert.match(ONBOARDING_FLOW, /id: "starter"/, "starter plan");
  assert.match(ONBOARDING_FLOW, /id: "pro"/, "pro plan");
  assert.match(ONBOARDING_FLOW, /id: "enterprise"/, "enterprise plan");
});

test("mobile: onboarding calls signUpMobile on completion", () => {
  assert.match(ONBOARDING_FLOW, /signUpMobile/, "calls signUpMobile");
});

test("mobile: onboarding has progress dots", () => {
  assert.match(ONBOARDING_FLOW, /w-8 bg-yellow-400/, "active progress dot");
  assert.match(ONBOARDING_FLOW, /w-4 bg-white/, "inactive progress dot");
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. In-app pricing at /app-pricing
// ═══════════════════════════════════════════════════════════════════════════
test("mobile: /app-pricing page exists", () => {
  assert.match(APP_PRICING, /AppPricingScreen/, "AppPricingScreen imported");
});

test("mobile: app-pricing shows 3 plans (Free removed)", () => {
  assert.doesNotMatch(APP_PRICING_SCREEN, /id: "free"/, "free plan removed");
  assert.match(APP_PRICING_SCREEN, /id: "starter"/, "starter plan");
  assert.match(APP_PRICING_SCREEN, /id: "pro"/, "pro plan");
  assert.match(APP_PRICING_SCREEN, /id: "enterprise"/, "enterprise plan");
  assert.match(APP_PRICING_SCREEN, /space-y-4/, "stacked layout (space-y-4)");
});

test("mobile: app-pricing links to onboarding and contact-enterprise", () => {
  assert.match(APP_PRICING_SCREEN, /\/onboarding/, "link to onboarding");
  assert.match(APP_PRICING_SCREEN, /\/contact-enterprise/, "link to contact-enterprise");
});

test("mobile: app-pricing has back link to /welcome", () => {
  assert.match(APP_PRICING_SCREEN, /\/welcome/, "back to welcome");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Mobile auth abstraction
// ═══════════════════════════════════════════════════════════════════════════
test("mobile: signInWithApple uses Supabase signInWithIdToken", () => {
  assert.match(MOBILE_AUTH, /signInWithApple/, "signInWithApple function");
  assert.match(MOBILE_AUTH, /signInWithIdToken/, "uses Supabase signInWithIdToken");
  assert.match(MOBILE_AUTH, /provider: "apple"/, "provider is apple");
  assert.match(MOBILE_AUTH, /identityToken/, "accepts identityToken parameter");
});

test("mobile: signInWithApple updates profile with Apple name on first sign-in", () => {
  assert.match(MOBILE_AUTH, /first_name.*fullName/, "updates first_name from Apple name");
  assert.match(MOBILE_AUTH, /last_name.*fullName/, "updates last_name from Apple name");
});

test("mobile: signInWithApple routes incomplete profiles to /admin/profile?onboarding=1", () => {
  assert.match(MOBILE_AUTH, /isProfileIncomplete/, "checks if profile is incomplete");
  assert.match(MOBILE_AUTH, /\/admin\/profile\?onboarding=1/, "redirects incomplete profiles to profile onboarding");
});

test("mobile: signInMobile routes by role", () => {
  assert.match(MOBILE_AUTH, /signInMobile/, "signInMobile function");
  assert.match(MOBILE_AUTH, /role === .operator./, "checks operator role");
  assert.match(MOBILE_AUTH, /\/operator/, "redirects operator to /operator");
  assert.match(MOBILE_AUTH, /\/admin\/projects/, "redirects admin to /admin/projects");
});

test("mobile: signUpMobile creates account with onboarding data", () => {
  assert.match(MOBILE_AUTH, /signUpMobile/, "signUpMobile function");
  assert.match(MOBILE_AUTH, /firstName/, "firstName in signup");
  assert.match(MOBILE_AUTH, /lastName/, "lastName in signup");
  assert.match(MOBILE_AUTH, /company/, "company in signup");
  assert.match(MOBILE_AUTH, /account_role/, "account_role in signup metadata");
  assert.match(MOBILE_AUTH, /selected_plan/, "selected_plan in signup metadata");
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. / redirects to /scan — no landing page
// ═══════════════════════════════════════════════════════════════════════════
test("mobile: / renders ScanHome directly with hydration-safe mounted fallback (no redirect)", () => {
  assert.match(HOME, /ScanHome/, "/ renders ScanHome directly");
  assert.doesNotMatch(HOME, /HomeContent/, "/ does NOT render HomeContent");
  assert.doesNotMatch(HOME, /from "next\/navigation"/, "/ does NOT import redirect");
  // ScanHome renders the passenger QR experience on both web and native.
  // A "mounted" state fallback prevents black screen on Capacitor iOS during hydration.
  const SCAN_HOME = readFileSync(join(root, "components/ScanHome.tsx"), "utf8");
  assert.match(SCAN_HOME, /mounted/, "ScanHome has mounted state for hydration safety");
  assert.doesNotMatch(SCAN_HOME, /router\.replace\("\/welcome"\)/, "ScanHome does NOT redirect to /welcome (would loop)");
  assert.doesNotMatch(SCAN_HOME, /WelcomeScreen/, "ScanHome does NOT render WelcomeScreen inline (passenger sees QR scan directly)");
});

test("mobile: web /pricing is NOT the app-pricing screen", () => {
  assert.doesNotMatch(WEB_PRICING, /AppPricingScreen/, "web pricing is NOT AppPricingScreen");
  assert.match(WEB_PRICING, /PublicNav/, "web pricing uses PublicNav (web nav)");
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. /operator unchanged
// ═══════════════════════════════════════════════════════════════════════════
test("mobile: /operator page unchanged", () => {
  assert.match(OPERATOR, /OperatorWorkspace/, "OperatorWorkspace in operator page");
  assert.doesNotMatch(OPERATOR, /WelcomeScreen/, "no WelcomeScreen in operator page");
  assert.doesNotMatch(OPERATOR, /OnboardingFlow/, "no OnboardingFlow in operator page");
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Capacitor iOS entry = /welcome
// ═══════════════════════════════════════════════════════════════════════════
const CAPACITOR_CONFIG = readFileSync(join(root, "capacitor.config.ts"), "utf8");
const APP_DELEGATE = readFileSync(join(root, "ios/App/App/AppDelegate.swift"), "utf8");
const CAP_REDIRECT_HOOK = readFileSync(join(root, "hooks/useCapacitorRedirect.ts"), "utf8");
const OUT_INDEX = readFileSync(join(root, "out/index.html"), "utf8");
const IOS_PUBLIC_INDEX = readFileSync(join(root, "ios/App/App/public/index.html"), "utf8");

test("capacitor: config uses webDir out for static serving", () => {
  assert.match(CAPACITOR_CONFIG, /webDir/, "webDir configured");
});

test("capacitor: useCapacitorRedirect hook detects native but does NOT redirect", () => {
  assert.match(CAP_REDIRECT_HOOK, /isNativePlatform/, "checks Capacitor.isNativePlatform");
  assert.doesNotMatch(CAP_REDIRECT_HOOK, /window\.location\.replace/, "no window.location.replace");
  assert.doesNotMatch(CAP_REDIRECT_HOOK, /router\.replace/, "no router.replace to /welcome (would cause loop)");
});

test("capacitor: HomeContent uses Capacitor redirect", () => {
  assert.match(HOME_CONTENT, /useCapacitorRedirect/, "imports redirect hook");
  assert.match(HOME_CONTENT, /ready/, "checks ready state before rendering");
});

test("capacitor: AppDelegate does NOT navigate to /welcome (removed to fix loop)", () => {
  assert.doesNotMatch(APP_DELEGATE, /window\.location\.replace/, "no window.location.replace to /welcome");
  assert.doesNotMatch(APP_DELEGATE, /evaluateJavaScript/, "no JS evaluation for navigation");
  assert.doesNotMatch(APP_DELEGATE, /CAPBridgeViewController/, "no bridge access for navigation");
});

test("capacitor: out/index.html has debug boot log + server bootstrap redirect (not /welcome)", () => {
  // The fallback HTML may redirect to the CAPACITOR_SERVER_URL (boot loader)
  // but must NEVER redirect to /welcome (infinite loop).
  assert.doesNotMatch(OUT_INDEX, /window\.location\.replace\("\/welcome"\)/, "no redirect to /welcome (would cause loop)");
  assert.doesNotMatch(OUT_INDEX, /window\.location\.replace\('\/welcome'\)/, "no redirect to /welcome variant");
  assert.match(OUT_INDEX, /iOS Boot/, "has debug boot log");
  // Must have either a server redirect (boot loader) or a clear error
  // when no server URL is configured — never a dead-end "Chargement" screen.
  const hasServerRedirect = OUT_INDEX.includes("window.location.replace") && !OUT_INDEX.includes("/welcome");
  const hasMissingUrlError = OUT_INDEX.includes("CAPACITOR_SERVER_URL non configuré");
  assert.ok(hasServerRedirect || hasMissingUrlError, "fallback must either redirect to server or show missing-URL error");
});

test("capacitor: ios/App/App/public/index.html has debug boot log + server bootstrap redirect (not /welcome)", () => {
  assert.doesNotMatch(IOS_PUBLIC_INDEX, /window\.location\.replace\("\/welcome"\)/, "no redirect to /welcome (would cause loop)");
  assert.doesNotMatch(IOS_PUBLIC_INDEX, /window\.location\.replace\('\/welcome'\)/, "no redirect to /welcome variant");
  assert.match(IOS_PUBLIC_INDEX, /iOS Boot/, "has debug boot log");
  const hasServerRedirect = IOS_PUBLIC_INDEX.includes("window.location.replace") && !IOS_PUBLIC_INDEX.includes("/welcome");
  const hasMissingUrlError = IOS_PUBLIC_INDEX.includes("CAPACITOR_SERVER_URL non configuré");
  assert.ok(hasServerRedirect || hasMissingUrlError, "fallback must either redirect to server or show missing-URL error");
});
