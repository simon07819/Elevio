/**
 * Permissions and project isolation tests.
 *
 * Verifies:
 * 1. Central permissions module exists with canX functions
 * 2. Free plan blocks project creation, dispatch, operators, QR
 * 3. Paid plans allow all features
 * 4. Project queries use explicit owner_id filter
 * 5. Admin project data checks ownership
 * 6. Profile creates entitlement row on signup
 * 7. Paywall has continue-with-free option
 * 8. Superadmin user list has Plan + Paiement (not Source Gratuit)
 * 9. Seed projects are archived
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

const PERMISSIONS = readFileSync(join(root, "lib/permissions.ts"), "utf8");
const PLAN_GUARDS = readFileSync(join(root, "lib/billing/planGuards.ts"), "utf8");
const PROJECTS = readFileSync(join(root, "lib/projects.ts"), "utf8");
const ADMIN_PROJECT = readFileSync(join(root, "lib/adminProject.ts"), "utf8");
const PROFILE = readFileSync(join(root, "lib/profile.ts"), "utf8");
const PAYWALL_CLIENT = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const SUPERADMIN_USERS = readFileSync(join(root, "components/superadmin/SuperadminUserList.tsx"), "utf8");
const SEED_SQL = readFileSync(join(root, "supabase/seed.sql"), "utf8");
const ONBOARDING = readFileSync(join(root, "components/mobile/OnboardingFlow.tsx"), "utf8");
const UPGRADE_PROMPT = readFileSync(join(root, "components/UpgradePrompt.tsx"), "utf8");
const AUTH = readFileSync(join(root, "lib/auth.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. Central permissions module
// ═══════════════════════════════════════════════════════════════════

test("permissions: central module exists with canX functions", () => {
  assert.match(PERMISSIONS, /canCreateProject/, "canCreateProject function");
  assert.match(PERMISSIONS, /canCreateJobsite/, "canCreateJobsite function");
  assert.match(PERMISSIONS, /canUseDispatch/, "canUseDispatch function");
  assert.match(PERMISSIONS, /canActivateOperators/, "canActivateOperators function");
  assert.match(PERMISSIONS, /canUseQrProject/, "canUseQrProject function");
  assert.match(PERMISSIONS, /canAccessAdvancedAnalytics/, "canAccessAdvancedAnalytics function");
});

test("permissions: free plan blocks all paid features", () => {
  // Each canX function checks planId === "free" → return false
  const freeChecks = PERMISSIONS.match(/planId === "free"/g);
  assert.ok((freeChecks?.length ?? 0) >= 5, "at least 5 free plan checks");
});

test("permissions: getFreePlanRestrictions lists all blocked features", () => {
  assert.match(PERMISSIONS, /getFreePlanRestrictions/, "function exists");
  assert.match(PERMISSIONS, /Création de projets/, "lists project creation");
  assert.match(PERMISSIONS, /Dispatch/, "lists dispatch");
  assert.match(PERMISSIONS, /opérateurs/, "lists operators");
});

// ═══════════════════════════════════════════════════════════════════
// 2. Free plan in planGuards
// ═══════════════════════════════════════════════════════════════════

test("planGuards: free plan returns hasActiveSubscription=false", () => {
  assert.match(PLAN_GUARDS, /rawPlan === "free"/, "checks for free plan");
  assert.match(PLAN_GUARDS, /hasActiveSubscription: false/, "returns false for free");
});

test("planGuards: no subscription row defaults to free (not starter)", () => {
  assert.match(PLAN_GUARDS, /status: "free"/, "no subscription = free status");
  assert.doesNotMatch(PLAN_GUARDS, /Starter without a subscription.*grandfathered/, "no starter grandfathering");
});

test("planGuards: rawPlan defaults to free (not starter)", () => {
  assert.match(PLAN_GUARDS, /\?\? "free"/, "defaults to free");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Project isolation
// ═══════════════════════════════════════════════════════════════════

test("projects: getProjects uses explicit owner_id filter", () => {
  assert.match(PROJECTS, /\.eq\("owner_id", user\.id\)/, "filters by owner_id");
  assert.match(PROJECTS, /archived_at/, "filters archived projects");
});

test("projects: adminProject checks ownership before returning data", () => {
  assert.match(ADMIN_PROJECT, /owner_id !== user\.id/, "ownership check");
  assert.match(ADMIN_PROJECT, /notFound/, "returns notFound for unauthorized access");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Profile creates entitlement on signup
// ═══════════════════════════════════════════════════════════════════

test("profile: ensureProfileForUser creates entitlement row", () => {
  assert.match(PROFILE, /user_entitlements/, "creates entitlement row");
  assert.match(PROFILE, /selected_plan/, "reads selected_plan from metadata");
  assert.match(PROFILE, /"free"/, "defaults to free plan");
  assert.match(PROFILE, /upsert/, "uses upsert for idempotency");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Paywall has continue-with-free option
// ═══════════════════════════════════════════════════════════════════

test("paywall: has continue-with-free button", () => {
  assert.match(PAYWALL_CLIENT, /Continuer avec le forfait gratuit/, "continue free button");
  assert.match(PAYWALL_CLIENT, /Accès limité/, "explains limitation");
});

// ═══════════════════════════════════════════════════════════════════
// 6. Superadmin user list: Plan + Paiement (not Source Gratuit)
// ═══════════════════════════════════════════════════════════════════

test("superadmin: user list has Forfait and Paiement columns (not Source)", () => {
  assert.match(SUPERADMIN_USERS, /Forfait/, "Forfait column header");
  assert.match(SUPERADMIN_USERS, /Paiement/, "Paiement column header");
  assert.doesNotMatch(SUPERADMIN_USERS, /Source/, "no Source column");
});

test("superadmin: paymentBadge returns null for default/free (no Gratuit badge)", () => {
  assert.match(SUPERADMIN_USERS, /case "default": return null/, "default shows no badge");
});

test("superadmin: planBadge shows plan labels with color coding", () => {
  assert.match(SUPERADMIN_USERS, /planBadge/, "planBadge function exists");
  assert.match(SUPERADMIN_USERS, /PLANS\[planId/, "uses PLANS for labels");
});

// ═══════════════════════════════════════════════════════════════════
// 7. Seed projects are archived
// ═══════════════════════════════════════════════════════════════════

test("seed: demo projects are archived (not visible to new users)", () => {
  assert.match(SEED_SQL, /archived_at/, "seed projects have archived_at column");
  assert.match(SEED_SQL, /now\(\)/, "seed projects use now() for archived_at");
});

// ═══════════════════════════════════════════════════════════════════
// 8. Onboarding includes free plan option
// ═══════════════════════════════════════════════════════════════════

test("onboarding: includes free plan as first option", () => {
  assert.match(ONBOARDING, /id: "free"/, "free plan option");
  assert.match(ONBOARDING, /Gratuit/, "Gratuit label");
  assert.match(ONBOARDING, /0 \$|0 \$\/mois/, "free price shown");
});

test("onboarding: default plan is free (not starter)", () => {
  assert.match(ONBOARDING, /useState\("free"\)/, "default planId is free");
});

// ═══════════════════════════════════════════════════════════════════
// 9. UpgradePrompt component exists
// ═══════════════════════════════════════════════════════════════════

test("components: UpgradePrompt component exists with CTA", () => {
  assert.match(UPGRADE_PROMPT, /Fonction réservée aux forfaits payants/, "restriction message");
  assert.match(UPGRADE_PROMPT, /Voir les forfaits/, "upgrade CTA");
  assert.match(UPGRADE_PROMPT, /\/paywall/, "links to paywall");
  assert.match(UPGRADE_PROMPT, /UpgradeBadge/, "inline badge exists");
});

// ═══════════════════════════════════════════════════════════════════
// 10. Auth has requireAdminWithPlan for free-user dashboard access
// ═══════════════════════════════════════════════════════════════════

test("auth: requireAdminWithPlan allows free users to access dashboard", () => {
  assert.match(AUTH, /requireAdminWithPlan/, "function exists");
  assert.match(AUTH, /isFree/, "returns isFree flag");
  assert.match(AUTH, /planId/, "returns planId");
  assert.match(AUTH, /getSubscriptionStatus/, "checks subscription status");
});
