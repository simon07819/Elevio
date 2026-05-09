/**
 * Navigation UX tests.
 *
 * Verifies:
 * - Logo always links to home (/)
 * - Back button exists on non-root pages
 * - No dead-end pages (every page has a way out)
 * - Mobile bottom nav exists
 * - Key pages are reachable via nav links
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const APP_SHELL = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
const APP_NAV = readFileSync(join(root, "components/AppNavigation.tsx"), "utf8");
const BRAND_LOGO = readFileSync(join(root, "components/BrandLogo.tsx"), "utf8");
const BACK_BUTTON = readFileSync(join(root, "components/BackButton.tsx"), "utf8");
const MOBILE_NAV = readFileSync(join(root, "components/MobileBottomNav.tsx"), "utf8");
const SUPERADMIN_SHELL = readFileSync(join(root, "components/superadmin/SuperadminShell.tsx"), "utf8");
const SCAN_HOME = readFileSync(join(root, "components/ScanHome.tsx"), "utf8");
const SUPPORT_PAGE = readFileSync(join(root, "app/support/page.tsx"), "utf8");
const LOGIN_PAGE = readFileSync(join(root, "app/admin/login/page.tsx"), "utf8");
const PAYWALL_CLIENT = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const OPERATOR_PAGE = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
const WELCOME_SCREEN = readFileSync(join(root, "components/mobile/WelcomeScreen.tsx"), "utf8");
const HOME_PAGE = readFileSync(join(root, "app/page.tsx"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. Logo clickable everywhere
// ═══════════════════════════════════════════════════════════════════

test("nav: BrandLogo supports clickable prop", () => {
  assert.match(BRAND_LOGO, /clickable/, "has clickable prop");
  assert.match(BRAND_LOGO, /href="\/"/, "links to / when clickable");
});

test("nav: AppShell logo links to /", () => {
  assert.match(APP_SHELL, /href="\/"/, "logo links to /");
  assert.match(APP_SHELL, /BrandLogo/, "renders BrandLogo");
});

test("nav: ScanHome logo is clickable", () => {
  assert.match(SCAN_HOME, /BrandLogo.*clickable|clickable.*BrandLogo/, "logo is clickable");
});

test("nav: Login page logo links to /", () => {
  assert.match(LOGIN_PAGE, /href="\/"/, "logo links to /");
  assert.match(LOGIN_PAGE, /BrandLogo/, "has logo");
});

test("nav: SuperadminShell logo links to /", () => {
  assert.match(SUPERADMIN_SHELL, /href="\/"/, "logo links to /");
  assert.match(SUPERADMIN_SHELL, /BrandLogo/, "has logo");
});

test("nav: WelcomeScreen logo is clickable", () => {
  assert.match(WELCOME_SCREEN, /clickable/, "logo is clickable");
});

test("nav: Support page logo links to /", () => {
  assert.match(SUPPORT_PAGE, /href="\/"/, "logo links to /");
  assert.match(SUPPORT_PAGE, /BrandLogo/, "has logo");
});

// ═══════════════════════════════════════════════════════════════════
// 2. Back navigation exists on non-root pages
// ═══════════════════════════════════════════════════════════════════

test("nav: BackButton component exists with router.back()", () => {
  assert.match(BACK_BUTTON, /router\.back/, "uses router.back()");
  assert.match(BACK_BUTTON, /ArrowLeft/, "shows arrow icon");
});

test("nav: BackButton hides on root pages", () => {
  assert.match(BACK_BUTTON, /isRoot/, "checks if on root page");
  assert.match(BACK_BUTTON, /return null/, "returns null on root");
});

test("nav: BackButton has fallback to /", () => {
  assert.match(BACK_BUTTON, /fallback/, "accepts fallback prop");
  assert.match(BACK_BUTTON, /router\.push/, "falls back to router.push");
});

test("nav: AppShell includes BackButton", () => {
  assert.match(APP_SHELL, /BackButton/, "AppShell has BackButton");
});

test("nav: Support page includes BackButton", () => {
  assert.match(SUPPORT_PAGE, /BackButton/, "support page has BackButton");
});

test("nav: PaywallClient has back link", () => {
  assert.match(PAYWALL_CLIENT, /ArrowLeft|Back|href="\/"/, "paywall has back navigation");
});

test("nav: SuperadminShell has back to app link", () => {
  assert.match(SUPERADMIN_SHELL, /superadmin\.backToApp/, "has back to app text");
  assert.match(SUPERADMIN_SHELL, /href="\/"/, "links to /");
});

// ═══════════════════════════════════════════════════════════════════
// 3. No dead-end pages
// ═══════════════════════════════════════════════════════════════════

test("nav: Login page has back to scan link", () => {
  assert.match(LOGIN_PAGE, /href="\/"/, "has link to /");
});

test("nav: Support page has back navigation + clickable logo", () => {
  assert.match(SUPPORT_PAGE, /BackButton/, "has back button");
  assert.match(SUPPORT_PAGE, /href="\/"/, "logo links to /");
});

test("nav: PaywallClient has escape route", () => {
  // Either a back button or a link to /
  assert.match(PAYWALL_CLIENT, /href="\/"/, "has link to /");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Mobile bottom nav
// ═══════════════════════════════════════════════════════════════════

test("nav: MobileBottomNav has 4 sections (scan, operator, admin, support)", () => {
  assert.match(MOBILE_NAV, /\/scan/, "has scan link");
  assert.match(MOBILE_NAV, /\/operator/, "has operator link");
  assert.match(MOBILE_NAV, /\/admin/, "has admin link");
  assert.match(MOBILE_NAV, /\/support/, "has support link");
});

test("nav: MobileBottomNav is hidden on desktop (sm:hidden)", () => {
  assert.match(MOBILE_NAV, /sm:hidden/, "hidden on desktop");
});

test("nav: MobileBottomNav shows active state", () => {
  assert.match(MOBILE_NAV, /pathname/, "checks current path");
  assert.match(MOBILE_NAV, /active/, "has active state logic");
});

test("nav: AppShell includes MobileBottomNav", () => {
  assert.match(APP_SHELL, /MobileBottomNav/, "AppShell has MobileBottomNav");
});

test("nav: Operator page includes MobileBottomNav", () => {
  assert.match(OPERATOR_PAGE, /MobileBottomNav/, "operator page has MobileBottomNav");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Key pages reachable via navigation
// ═══════════════════════════════════════════════════════════════════

test("nav: AppNavigation links to /scan, /operator, /admin, /support", () => {
  assert.match(APP_NAV, /\/scan/, "has scan link");
  assert.match(APP_NAV, /\/operator/, "has operator link");
  assert.match(APP_NAV, /\/admin/, "has admin link");
  assert.match(APP_NAV, /\/support/, "has support link");
});

test("nav: SuperadminShell sidebar has all sub-pages", () => {
  assert.match(SUPERADMIN_SHELL, /\/superadmin\/users/, "users link");
  assert.match(SUPERADMIN_SHELL, /\/superadmin\/accounts/, "accounts link");
  assert.match(SUPERADMIN_SHELL, /\/superadmin\/billing/, "billing link");
  assert.match(SUPERADMIN_SHELL, /\/superadmin\/logs/, "logs link");
  assert.match(SUPERADMIN_SHELL, /\/superadmin\/settings/, "settings link");
});

test("nav: / (home) renders ScanHome", () => {
  assert.match(HOME_PAGE, /ScanHome/, "home page is ScanHome");
});

test("nav: WelcomeScreen links to /scan, /operator, /admin", () => {
  assert.match(WELCOME_SCREEN, /\/scan/, "scan link");
  assert.match(WELCOME_SCREEN, /\/operator/, "operator link");
  assert.match(WELCOME_SCREEN, /\/admin/, "admin link");
});
