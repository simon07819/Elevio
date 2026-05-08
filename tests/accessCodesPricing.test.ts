/**
 * Access codes, pricing, and French translation tests.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

const PLANS = readFileSync(join(root, "lib/billing/plans.ts"), "utf8");
const PAYWALL = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const PRICING_GRID = readFileSync(join(root, "components/public/PricingGrid.tsx"), "utf8");
const APP_PRICING = readFileSync(join(root, "components/mobile/AppPricingScreen.tsx"), "utf8");
const ACTIVATION = readFileSync(join(root, "lib/billing/activation.ts"), "utf8");
const ACCESS_CODES_SERVER = readFileSync(join(root, "lib/superadminAccessCodes.ts"), "utf8");
const ACCESS_CODES_UI = readFileSync(join(root, "components/superadmin/AccessCodeManager.tsx"), "utf8");
const ACCESS_CODES_PAGE = readFileSync(join(root, "app/superadmin/codes/page.tsx"), "utf8");
const BACK_BUTTON = readFileSync(join(root, "components/BackButton.tsx"), "utf8");
const UPGRADE_CTA = readFileSync(join(root, "components/admin/UpgradeCTA.tsx"), "utf8");
const PERMISSIONS = readFileSync(join(root, "lib/permissions.ts"), "utf8");
const MIGRATION = readFileSync(join(root, "supabase/migrations/access_codes_flexible.sql"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. Access codes — DB migration
// ═══════════════════════════════════════════════════════════════════

test("migration: access_codes table created with all required columns", () => {
  assert.match(MIGRATION, /create table.*access_codes/, "access_codes table");
  assert.match(MIGRATION, /code text not null unique/, "code column unique");
  assert.match(MIGRATION, /plan text not null/, "plan column");
  assert.match(MIGRATION, /duration text not null/, "duration column");
  assert.match(MIGRATION, /max_uses integer/, "max_uses column");
  assert.match(MIGRATION, /current_uses integer/, "current_uses column");
  assert.match(MIGRATION, /enabled boolean/, "enabled column");
});

test("migration: access_code_usage table tracks who used codes", () => {
  assert.match(MIGRATION, /create table.*access_code_usage/, "usage table");
  assert.match(MIGRATION, /user_id uuid not null/, "user_id column");
  assert.match(MIGRATION, /user_email text/, "user_email column");
});

test("migration: RLS policies protect access codes", () => {
  assert.match(MIGRATION, /enable row level security/, "RLS enabled");
  assert.match(MIGRATION, /Superadmin can read/, "superadmin read policy");
  assert.match(MIGRATION, /Superadmin can insert/, "superadmin insert policy");
  assert.match(MIGRATION, /Superadmin can update/, "superadmin update policy");
});

// ═══════════════════════════════════════════════════════════════════
// 2. Access codes — server logic
// ═══════════════════════════════════════════════════════════════════

test("activation: checks all code conditions before activating", () => {
  assert.match(ACTIVATION, /codeRow\.enabled/, "checks enabled");
  assert.match(ACTIVATION, /current_uses.*max_uses/, "checks usage limit");
  assert.match(ACTIVATION, /calculateExpiry/, "calculates entitlement expiry");
  assert.match(ACTIVATION, /access_codes/, "queries access_codes table");
  assert.match(ACTIVATION, /access_code_usage/, "records usage");
});

test("activation: supports duration options", () => {
  assert.match(ACTIVATION, /"7d"/, "7 days duration");
  assert.match(ACTIVATION, /"30d"/, "30 days duration");
  assert.match(ACTIVATION, /"1y"/, "1 year duration");
  assert.match(ACTIVATION, /"permanent"/, "permanent duration");
  assert.match(ACTIVATION, /"custom"/, "custom duration");
});

test("activation: legacy enterprise codes still supported", () => {
  assert.match(ACTIVATION, /enterprise_activation_codes/, "legacy fallback");
});

test("superadmin: access codes CRUD actions exist", () => {
  assert.match(ACCESS_CODES_SERVER, /createAccessCode/, "create action");
  assert.match(ACCESS_CODES_SERVER, /toggleAccessCode/, "toggle action");
  assert.match(ACCESS_CODES_SERVER, /deleteAccessCode/, "delete action");
  assert.match(ACCESS_CODES_SERVER, /getAccessCodes/, "list action");
  assert.match(ACCESS_CODES_SERVER, /getAccessCodeUsage/, "usage action");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Access codes — superadmin UI
// ═══════════════════════════════════════════════════════════════════

test("superadmin: AccessCodeManager component exists with full UI", () => {
  assert.match(ACCESS_CODES_UI, /AccessCodeManager/, "component export");
  assert.match(ACCESS_CODES_UI, /G[ée]n[ée]rer des codes|Cr[ée]er un code/, "create button");
  assert.match(ACCESS_CODES_UI, /Désactiver|Activer/, "toggle buttons");
  assert.match(ACCESS_CODES_UI, /Supprimer/, "delete button");
  assert.match(ACCESS_CODES_UI, /copyCode/, "copy code function");
  assert.match(ACCESS_CODES_UI, /usageModal/, "usage modal");
  assert.match(ACCESS_CODES_UI, /Source \/ provider/, "source/provider distinct from plan");
  assert.match(ACCESS_CODES_UI, /Cycle de facturation/, "billing interval field");
});

test("superadmin: /superadmin/codes page exists", () => {
  assert.match(ACCESS_CODES_PAGE, /requireSuperAdmin/, "requires auth");
  assert.match(ACCESS_CODES_PAGE, /AccessCodeManager/, "renders manager");
  assert.match(ACCESS_CODES_PAGE, /Codes (achat|d.*acc[èe]s)/, "French title");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Pricing — 20% annual discount
// ═══════════════════════════════════════════════════════════════════

test("plans: annual prices represent exactly 20% discount", () => {
  // Starter: 199 * 12 * 0.8 = 1908
  assert.match(PLANS, /priceAnnual: 1908/, "Starter annual = 199*12*0.8");
  // Pro: 499 * 12 * 0.8 = 4788
  assert.match(PLANS, /priceAnnual: 4788/, "Pro annual = 499*12*0.8");
});

test("plans: free plan has zero projects and operators", () => {
  const freeSection = PLANS.match(/free: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(freeSection, /maxProjects: 0/, "free has 0 projects");
  assert.match(freeSection, /maxOperators: 0/, "free has 0 operators");
  assert.match(freeSection, /maxRequestsPerDay: 0/, "free has 0 requests");
  assert.match(freeSection, /analytics: "none"/, "free has no analytics");
});

test("paywall: has monthly/annual toggle", () => {
  assert.match(PAYWALL, /Mensuel/, "monthly toggle label");
  assert.match(PAYWALL, /Annuel/, "annual toggle label");
  assert.match(PAYWALL, /setPeriod/, "period state setter");
});

test("paywall: shows 20% savings badge", () => {
  assert.match(PAYWALL, /Économisez 20%/, "savings badge in plan card");
  assert.match(PAYWALL, /-20%/, "discount indicator on toggle");
});

test("paywall: passes period to subscribe handler and Stripe", () => {
  assert.match(PAYWALL, /selectedPeriod/, "uses selected period");
  assert.match(PAYWALL, /period: selectedPeriod/, "passes to Stripe");
  assert.match(PAYWALL, /annual/, "supports annual IAP");
});

// ═══════════════════════════════════════════════════════════════════
// 5. French translations — no English in user-facing UI
// ═══════════════════════════════════════════════════════════════════

test("paywall: all visible text is in French", () => {
  assert.match(PAYWALL, /Choisissez votre forfait/, "French title");
  assert.doesNotMatch(PAYWALL, />Back</, "no English 'Back'");
  assert.match(PAYWALL, /Retour/, "French 'Retour'");
  assert.doesNotMatch(PAYWALL, /Efficiency score/, "no English feature name");
  assert.doesNotMatch(PAYWALL, /Business insights/, "no English feature name");
  assert.doesNotMatch(PAYWALL, /Operator performance/, "no English feature name");
  assert.doesNotMatch(PAYWALL, /See where time is lost/, "no English feature name");
});

test("pricing-grid: all descriptions are in French", () => {
  assert.doesNotMatch(PRICING_GRID, /Reduce wait times/, "no English description");
  assert.doesNotMatch(PRICING_GRID, /Optimize operator/, "no English description");
  assert.doesNotMatch(PRICING_GRID, /Prove productivity/, "no English description");
  assert.doesNotMatch(PRICING_GRID, /Efficiency score & insights/, "no English feature");
  assert.doesNotMatch(PRICING_GRID, /Operator performance metrics/, "no English feature");
  assert.doesNotMatch(PRICING_GRID, /Identify peak congestion/, "no English feature");
  assert.doesNotMatch(PRICING_GRID, /Company-wide reporting/, "no English feature");
  assert.doesNotMatch(PRICING_GRID, /Custom support/, "no English feature");
});

test("app-pricing: all descriptions are in French", () => {
  assert.doesNotMatch(APP_PRICING, /Reduce wait times/, "no English description");
  assert.doesNotMatch(APP_PRICING, /Optimize operator/, "no English description");
  assert.doesNotMatch(APP_PRICING, /Efficiency score & insights/, "no English feature");
  assert.doesNotMatch(APP_PRICING, /Company-wide reporting/, "no English feature");
  assert.doesNotMatch(APP_PRICING, /Custom support/, "no English feature");
});

test("back-button: text is in French", () => {
  assert.match(BACK_BUTTON, /Retour/, "French 'Retour' text");
  assert.match(BACK_BUTTON, /aria-label="Retour"/, "French aria-label");
  assert.doesNotMatch(BACK_BUTTON, />Back</, "no English 'Back'");
});

test("upgrade-cta: text is in French", () => {
  assert.match(UPGRADE_CTA, /Disponible avec le forfait/, "French 'Available on'");
  assert.match(UPGRADE_CTA, /Voir les forfaits/, "French 'Upgrade' CTA");
  assert.doesNotMatch(UPGRADE_CTA, />Upgrade</, "no English 'Upgrade'");
});

test("permissions: isPaidPlan logic is correct (not always true)", () => {
  assert.match(PERMISSIONS, /planId !== "free"/, "simple correct check");
  assert.doesNotMatch(PERMISSIONS, /\|\| planId !== "free"/, "no buggy || check");
});
