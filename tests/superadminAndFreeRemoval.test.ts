import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();

// ── Source files ──
const SUPERADMIN_AUTH = fs.readFileSync(path.join(ROOT, "lib/auth/superadmin.ts"), "utf-8");
const PLANS_TS = fs.readFileSync(path.join(ROOT, "lib/billing/plans.ts"), "utf-8");
const PLAN_GUARDS = fs.readFileSync(path.join(ROOT, "lib/billing/planGuards.ts"), "utf-8");
const ENTITLEMENTS = fs.readFileSync(path.join(ROOT, "lib/billing/entitlements.ts"), "utf-8");
const PRICING_GRID = fs.readFileSync(path.join(ROOT, "components/public/PricingGrid.tsx"), "utf-8");
const APP_PRICING = fs.readFileSync(path.join(ROOT, "components/mobile/AppPricingScreen.tsx"), "utf-8");
const ONBOARDING = fs.readFileSync(path.join(ROOT, "components/mobile/OnboardingFlow.tsx"), "utf-8");
const LAYOUT = fs.readFileSync(path.join(ROOT, "app/superadmin/layout.tsx"), "utf-8");
const DASHBOARD = fs.readFileSync(path.join(ROOT, "app/superadmin/page.tsx"), "utf-8");
const USERS_PAGE = fs.readFileSync(path.join(ROOT, "app/superadmin/users/page.tsx"), "utf-8");
const BILLING_PAGE = fs.readFileSync(path.join(ROOT, "app/superadmin/billing/page.tsx"), "utf-8");
const LOGS_PAGE = fs.readFileSync(path.join(ROOT, "app/superadmin/logs/page.tsx"), "utf-8");
const CONTENT_PAGE = fs.readFileSync(path.join(ROOT, "app/superadmin/content/page.tsx"), "utf-8");
const SETTINGS_PAGE = fs.readFileSync(path.join(ROOT, "app/superadmin/settings/page.tsx"), "utf-8");
const SUPERADMIN_ACTIONS = fs.readFileSync(path.join(ROOT, "lib/superadminActions.ts"), "utf-8");
const SITE_SETTINGS = fs.readFileSync(path.join(ROOT, "lib/siteSettingsConfig.ts"), "utf-8");
const SITE_SETTINGS_ACTIONS = fs.readFileSync(path.join(ROOT, "lib/siteSettings.ts"), "utf-8");

// ═══════════════════════════════════════════════════════════════════
// 1. Free plan removed
// ═══════════════════════════════════════════════════════════════════
describe("Free plan removal", () => {
  test("VISIBLE_PLAN_IDS excludes free", () => {
    assert.match(PLANS_TS, /VISIBLE_PLAN_IDS/, "VISIBLE_PLAN_IDS defined");
    assert.doesNotMatch(PLANS_TS, /VISIBLE_PLAN_IDS.*"free"/, "free not in VISIBLE_PLAN_IDS");
    assert.match(PLANS_TS, /VISIBLE_PLAN_IDS.*"starter"/, "starter in VISIBLE_PLAN_IDS");
    assert.match(PLANS_TS, /VISIBLE_PLAN_IDS.*"pro"/, "pro in VISIBLE_PLAN_IDS");
    assert.match(PLANS_TS, /VISIBLE_PLAN_IDS.*"enterprise"/, "enterprise in VISIBLE_PLAN_IDS");
  });

  test("PLAN_ORDER excludes free", () => {
    assert.doesNotMatch(PLANS_TS, /PLAN_ORDER.*"free".*"starter"/, "free not first in PLAN_ORDER");
    assert.match(PLANS_TS, /PLAN_ORDER.*"starter".*"pro"/, "starter before pro in PLAN_ORDER");
  });

  test("DEFAULT_PLAN is starter", () => {
    assert.match(PLANS_TS, /DEFAULT_PLAN.*"starter"/, "default plan is starter");
  });

  test("effectivePlanId maps free → starter", () => {
    assert.match(PLANS_TS, /effectivePlanId/, "effectivePlanId function exists");
    assert.match(PLANS_TS, /FREE_EQUIVALENT.*"starter"/, 'FREE_EQUIVALENT = "starter"');
  });

  test("getPlan uses effectivePlanId", () => {
    const getPlanSection = PLANS_TS.match(/function getPlan[\s\S]*?\n\}/)?.[0] ?? "";
    assert.match(getPlanSection, /effectivePlanId/, "getPlan calls effectivePlanId");
  });

  test("PricingGrid has 3 plan cards (Free removed)", () => {
    assert.doesNotMatch(PRICING_GRID, /name: "Free"/, "Free card removed from PricingGrid");
    assert.match(PRICING_GRID, /name: "Starter"/, "Starter card present");
    assert.match(PRICING_GRID, /name: "Pro"/, "Pro card present");
    assert.match(PRICING_GRID, /name: "Enterprise"/, "Enterprise card present");
  });

  test("planGuards defaults to starter (not free)", () => {
    assert.match(PLAN_GUARDS, /"starter"/, "planGuards references starter");
    assert.match(PLAN_GUARDS, /effectivePlanId/, "planGuards uses effectivePlanId");
  });

  test("entitlements defaults to starter (not free)", () => {
    assert.match(ENTITLEMENTS, /"starter"/, "entitlements references starter");
    assert.match(ENTITLEMENTS, /effectivePlanId/, "entitlements uses effectivePlanId");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Superadmin auth
// ═══════════════════════════════════════════════════════════════════
describe("Superadmin auth", () => {
  test("SUPERADMIN_EMAIL has no hardcoded fallback", () => {
    assert.match(SUPERADMIN_AUTH, /SUPERADMIN_EMAIL.*\?\? ?""/, "no hardcoded email — must be set via env var");
  });

  test("isSuperAdminEmail uses lowercase comparison", () => {
    assert.match(SUPERADMIN_AUTH, /toLowerCase/, "lowercase comparison used");
  });

  test("requireSuperAdmin redirects to /admin/login if not auth", () => {
    assert.match(SUPERADMIN_AUTH, /redirect.*admin\/login/, "redirects to /admin/login");
  });

  test("canAccessSuperAdmin checks profile role + email fallback", () => {
    assert.match(SUPERADMIN_AUTH, /canAccessSuperAdmin/, "canAccessSuperAdmin exists");
    assert.match(SUPERADMIN_AUTH, /isSuperAdmin/, "uses isSuperAdmin (profile + email)");
    assert.match(SUPERADMIN_AUTH, /isSuperAdminProfile/, "checks profile.role as primary");
  });

  test("no UI to create superadmin", () => {
    const settingsPanel = fs.readFileSync(path.join(ROOT, "components/superadmin/SuperadminSettingsPanel.tsx"), "utf-8");
    assert.match(settingsPanel, /SUPERADMIN_EMAIL|pas.*changer.*interface|environment/i, "no UI to change superadmin");
  });

  test("server-side check only (no client-only guards)", () => {
    assert.match(SUPERADMIN_AUTH, /requireSuperAdmin/, "requireSuperAdmin is server-side");
    assert.doesNotMatch(SUPERADMIN_AUTH, /use client/, "not a client module");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Superadmin routes
// ═══════════════════════════════════════════════════════════════════
describe("Superadmin routes", () => {
  test("layout calls requireSuperAdmin", () => {
    assert.match(LAYOUT, /requireSuperAdmin/, "layout protects with requireSuperAdmin");
  });

  test("dashboard page exists with cards", () => {
    assert.match(DASHBOARD, /getSuperadminDashboardData/, "dashboard fetches data");
    const DASH_COMPONENT = fs.readFileSync(path.join(ROOT, "components/superadmin/SuperadminAnalyticsDashboard.tsx"), "utf-8");
    assert.match(DASH_COMPONENT, /total_users|Nouveaux comptes/, "has account/user card");
    assert.match(DASH_COMPONENT, /active_projects|Compagnies/, "has companies/projects card");
  });

  test("/superadmin/users page exists", () => {
    assert.match(USERS_PAGE, /getSuperadminUsers/, "users page fetches users");
  });

  test("/superadmin/billing page exists", () => {
    assert.match(BILLING_PAGE, /getSuperadminBilling/, "billing page fetches billing");
  });

  test("/superadmin/logs page exists", () => {
    assert.match(LOGS_PAGE, /SuperadminLogViewer/, "logs page has log viewer");
  });

  test("/superadmin/content page exists", () => {
    assert.match(CONTENT_PAGE, /SuperadminContentEditor/, "content page has editor");
  });

  test("/superadmin/settings page exists", () => {
    assert.match(SETTINGS_PAGE, /SuperadminSettingsPanel/, "settings page has panel");
  });

  test("all sub-pages call requireSuperAdmin", () => {
    assert.match(USERS_PAGE, /requireSuperAdmin/, "users page protected");
    assert.match(BILLING_PAGE, /requireSuperAdmin/, "billing page protected");
    assert.match(LOGS_PAGE, /requireSuperAdmin/, "logs page protected");
    assert.match(CONTENT_PAGE, /requireSuperAdmin/, "content page protected");
    assert.match(SETTINGS_PAGE, /requireSuperAdmin/, "settings page protected");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Superadmin actions
// ═══════════════════════════════════════════════════════════════════
describe("Superadmin actions", () => {
  test("changeUserPlan server action exists", () => {
    assert.match(SUPERADMIN_ACTIONS, /changeUserPlan/, "changeUserPlan exists");
    assert.match(SUPERADMIN_ACTIONS, /"use server"/, "is a server action");
  });

  test("setUserSuspended server action exists", () => {
    assert.match(SUPERADMIN_ACTIONS, /setUserSuspended/, "setUserSuspended exists");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Site settings
// ═══════════════════════════════════════════════════════════════════
describe("Site settings", () => {
  test("EDITABLE_SETTINGS includes support email", () => {
    assert.match(SITE_SETTINGS, /support_email/, "support_email editable");
  });

  test("EDITABLE_SETTINGS includes maintenance message", () => {
    assert.match(SITE_SETTINGS, /maintenance_message/, "maintenance_message editable");
  });

  test("EDITABLE_SETTINGS includes product name", () => {
    assert.match(SITE_SETTINGS, /product_name/, "product_name editable");
  });

  test("saveSiteSetting server action exists", () => {
    assert.match(SITE_SETTINGS_ACTIONS, /saveSiteSetting/, "saveSiteSetting exists");
    assert.match(SITE_SETTINGS_ACTIONS, /"use server"/, "is a server action");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Existing pages still work
// ═══════════════════════════════════════════════════════════════════
describe("Existing pages unaffected", () => {
  test("/operator route still exists", () => {
    const operatorPage = fs.readFileSync(path.join(ROOT, "app/operator/page.tsx"), "utf-8");
    assert.ok(operatorPage.length > 0, "/operator page exists");
  });

  test("/pricing route still exists", () => {
    const pricingPage = fs.readFileSync(path.join(ROOT, "app/pricing/page.tsx"), "utf-8");
    assert.ok(pricingPage.length > 0, "/pricing page exists");
  });

  test("mobile OnboardingFlow default plan is starter", () => {
    assert.match(ONBOARDING, /useState\("starter"\)/, "default planId is starter");
  });

  test("app-pricing has 3 plans (no free)", () => {
    assert.doesNotMatch(APP_PRICING, /id: "free"/, "no free in app-pricing");
    const starterMatches = APP_PRICING.match(/id: "starter"/g);
    assert.equal(starterMatches?.length, 1, "exactly one starter card");
  });
});
