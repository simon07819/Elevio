/**
 * Billing / Paywall tests.
 *
 * Verifies:
 * - Plans defined with correct limits
 * - Product IDs exist
 * - Activation code validation
 * - Entitlement limit checks
 * - Paywall structure
 * - Business/Enterprise don't launch IAP
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const PLANS = readFileSync(join(root, "lib/billing/plans.ts"), "utf8");
const PRODUCT_IDS = readFileSync(join(root, "lib/billing/productIds.ts"), "utf8");
const ACTIVATION = readFileSync(join(root, "lib/billing/activation.ts"), "utf8");
const ENTITLEMENTS = readFileSync(join(root, "lib/billing/entitlements.ts"), "utf8");
const REVENUECAT = readFileSync(join(root, "lib/billing/revenuecat.ts"), "utf8");
const SCHEMA = readFileSync(join(root, "supabase/schema.sql"), "utf8");
const PAYWALL_PAGE = readFileSync(join(root, "app/paywall/page.tsx"), "utf8");
const PAYWALL_CLIENT = readFileSync(join(root, "components/billing/PaywallClient.tsx"), "utf8");
const PLAN_GUARDS = readFileSync(join(root, "lib/billing/planGuards.ts"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. Plans defined
// ═══════════════════════════════════════════════════════════════════
test("billing: 5 plans defined (free, starter, pro, business, enterprise)", () => {
  assert.match(PLANS, /"free"/, "free plan");
  assert.match(PLANS, /"starter"/, "starter plan");
  assert.match(PLANS, /"pro"/, "pro plan");
  assert.match(PLANS, /"business"/, "business plan");
  assert.match(PLANS, /"enterprise"/, "enterprise plan");
});

// ═══════════════════════════════════════════════════════════════════
// 2. Free plan limits
// ═══════════════════════════════════════════════════════════════════
test("billing: Free plan limits — 1 project, 1 operator, no analytics", () => {
  assert.match(PLANS, /maxProjects: 1/, "Free maxProjects = 1");
  assert.match(PLANS, /maxOperators: 1/, "Free maxOperators = 1");
  assert.match(PLANS, /analytics: "none"/, "Free analytics = none");
  assert.match(PLANS, /multiOperator: false/, "Free multiOperator = false");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Starter plan limits
// ═══════════════════════════════════════════════════════════════════
test("billing: Starter plan limits — 1 project, 2 operators, simple analytics", () => {
  const starterSection = PLANS.match(/starter: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(starterSection, /maxProjects: 1/, "Starter maxProjects = 1");
  assert.match(starterSection, /maxOperators: 2/, "Starter maxOperators = 2");
  assert.match(starterSection, /analytics: "simple"/, "Starter analytics = simple");
  assert.match(starterSection, /multiOperator: false/, "Starter multiOperator = false");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Pro plan limits
// ═══════════════════════════════════════════════════════════════════
test("billing: Pro plan limits — 3 projects, 10 operators, advanced analytics", () => {
  const proSection = PLANS.match(/pro: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(proSection, /maxProjects: 3/, "Pro maxProjects = 3");
  assert.match(proSection, /maxOperators: 10/, "Pro maxOperators = 10");
  assert.match(proSection, /analytics: "advanced"/, "Pro analytics = advanced");
  assert.match(proSection, /multiOperator: true/, "Pro multiOperator = true");
  assert.match(proSection, /popular: true/, "Pro is popular");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Enterprise plan limits
// ═══════════════════════════════════════════════════════════════════
test("billing: Enterprise plan — unlimited, activation code, custom contract", () => {
  const entSection = PLANS.match(/enterprise: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(entSection, /maxProjects: null/, "Enterprise maxProjects = null (unlimited)");
  assert.match(entSection, /maxOperators: null/, "Enterprise maxOperators = null (unlimited)");
  assert.match(entSection, /activationCode: true/, "Enterprise activationCode = true");
  assert.match(entSection, /customContract: true/, "Enterprise customContract = true");
  assert.match(entSection, /iapAvailable: false/, "Enterprise not IAP");
  assert.match(entSection, /contactSales: true/, "Enterprise contact sales");
});

// ═══════════════════════════════════════════════════════════════════
// 6. Product IDs exist
// ═══════════════════════════════════════════════════════════════════
test("billing: 4 Apple product IDs defined", () => {
  assert.match(PRODUCT_IDS, /com\.elevio\.starter\.monthly/, "starter monthly");
  assert.match(PRODUCT_IDS, /com\.elevio\.starter\.annual/, "starter annual");
  assert.match(PRODUCT_IDS, /com\.elevio\.pro\.monthly/, "pro monthly");
  assert.match(PRODUCT_IDS, /com\.elevio\.pro\.annual/, "pro annual");
});

// ═══════════════════════════════════════════════════════════════════
// 7. Activation code server action validates
// ═══════════════════════════════════════════════════════════════════
test("billing: activation code rejects invalid input", () => {
  assert.match(ACTIVATION, /Code invalide/, "rejects empty/short code");
  assert.match(ACTIVATION, /Connexion requise/, "rejects unauthenticated user");
});

test("billing: activation code checks expired codes", () => {
  assert.match(ACTIVATION, /expires_at/, "checks expires_at field");
  assert.match(ACTIVATION, /Ce code a expir/, "expired message");
});

test("billing: activation code checks already-used codes", () => {
  assert.match(ACTIVATION, /used_at/, "checks used_at field");
  assert.match(ACTIVATION, /Ce code a déjà été utilisé/, "already used message");
});

test("billing: activation code marks as used on success", () => {
  assert.match(ACTIVATION, /used_at: now/, "sets used_at");
  assert.match(ACTIVATION, /used_by_user_id: user\.id/, "sets used_by_user_id");
});

// ═══════════════════════════════════════════════════════════════════
// 8. Entitlements: limit functions
// ═══════════════════════════════════════════════════════════════════
test("billing: canCreateProject and canAddOperator functions exist", () => {
  assert.match(ENTITLEMENTS, /canCreateProject/, "canCreateProject function");
  assert.match(ENTITLEMENTS, /canAddOperator/, "canAddOperator function");
  assert.match(ENTITLEMENTS, /isEnterprise/, "isEnterprise function");
  assert.match(ENTITLEMENTS, /isBusinessOrAbove/, "isBusinessOrAbove function");
});

// ═══════════════════════════════════════════════════════════════════
// 9. DB schema has enterprise_activation_codes and user_entitlements
// ═══════════════════════════════════════════════════════════════════
test("billing: DB schema has enterprise_activation_codes table", () => {
  assert.match(SCHEMA, /enterprise_activation_codes/, "enterprise_activation_codes table");
  assert.match(SCHEMA, /code text not null unique/, "code column unique");
  assert.match(SCHEMA, /used_at timestamptz/, "used_at column");
  assert.match(SCHEMA, /expires_at timestamptz/, "expires_at column");
});

test("billing: DB schema has user_entitlements table", () => {
  assert.match(SCHEMA, /user_entitlements/, "user_entitlements table");
  assert.match(SCHEMA, /plan text not null default 'free'/, "plan column default free");
  assert.match(SCHEMA, /activated_via/, "activated_via column");
});

// ═══════════════════════════════════════════════════════════════════
// 10. Paywall page exists
// ═══════════════════════════════════════════════════════════════════
test("billing: paywall route exists at /paywall", () => {
  assert.match(PAYWALL_PAGE, /PaywallClient/, "PaywallClient imported");
});

test("billing: paywall shows Starter and Pro plans", () => {
  assert.match(PAYWALL_CLIENT, /IAP_PLANS/, "renders IAP plans");
  assert.match(PAYWALL_CLIENT, /(&apos;|')abonner/, "subscribe button text");
});

test("billing: paywall shows Business/Enterprise section", () => {
  assert.match(PAYWALL_CLIENT, /EnterpriseContactCard/, "EnterpriseContactCard component");
  assert.match(PAYWALL_CLIENT, /Obtenir un devis/, "contact sales button");
  assert.match(PAYWALL_CLIENT, /Activer avec un code/, "activation code button");
});

test("billing: paywall shows activation code input", () => {
  assert.match(PAYWALL_CLIENT, /ActivationCodeBox/, "ActivationCodeBox component");
  assert.match(PAYWALL_CLIENT, /activateEnterpriseCode/, "calls activateEnterpriseCode");
});

// ═══════════════════════════════════════════════════════════════════
// 11. Business/Enterprise do NOT launch IAP
// ═══════════════════════════════════════════════════════════════════
test("billing: Business and Enterprise are not IAP-eligible", () => {
  const bizSection = PLANS.match(/business: \{[\s\S]*?\n\}/)?.[0] ?? "";
  const entSection = PLANS.match(/enterprise: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(bizSection, /iapAvailable: false/, "Business not IAP");
  assert.match(entSection, /iapAvailable: false/, "Enterprise not IAP");
  assert.match(bizSection, /contactSales: true/, "Business contact sales");
  assert.match(entSection, /contactSales: true/, "Enterprise contact sales");
});

// ═══════════════════════════════════════════════════════════════════
// 12. RevenueCat mock — purchaseProduct returns not-available on web
// ═══════════════════════════════════════════════════════════════════
test("billing: RevenueCat purchaseProduct returns not-available message", () => {
  assert.match(REVENUECAT, /Abonnements Apple (bientôt |disponibles )/, "not-available message");
  assert.match(REVENUECAT, /ok: false/, "returns ok: false");
});

// ═══════════════════════════════════════════════════════════════════
// 13. IAP_PLANS and SALES_PLANS arrays
// ═══════════════════════════════════════════════════════════════════
test("billing: IAP_PLANS = [starter, pro], SALES_PLANS = [enterprise]", () => {
  assert.match(PLANS, /IAP_PLANS.*"starter".*"pro"/, "IAP_PLANS contains starter + pro");
  assert.match(PLANS, /SALES_PLANS.*"enterprise"/, "SALES_PLANS contains enterprise");
});

// ═══════════════════════════════════════════════════════════════════
// 14. Popular badge on Pro
// ═══════════════════════════════════════════════════════════════════
test("billing: Pro plan has popular badge in paywall UI", () => {
  assert.match(PAYWALL_CLIENT, /Populaire/, "popular badge text");
});

// ═══════════════════════════════════════════════════════════════════
// 15. Activation code rollback on entitlement error
// ═══════════════════════════════════════════════════════════════════
test("billing: activation code rolls back code usage on entitlement error", () => {
  assert.match(ACTIVATION, /Roll back/, "rollback comment");
  assert.match(ACTIVATION, /used_at: null.*used_by_user_id: null/, "resets code usage on error");
});

// ═══════════════════════════════════════════════════════════════════
// 16. Plan guards wired into server actions
// ═══════════════════════════════════════════════════════════════════

test("billing: planGuards.ts exists with enforce functions", () => {
  assert.match(PLAN_GUARDS, /enforceProjectLimit/, "enforceProjectLimit function");
  assert.match(PLAN_GUARDS, /enforceOperatorLimit/, "enforceOperatorLimit function");
  assert.match(PLAN_GUARDS, /enforceRequestLimit/, "enforceRequestLimit function");
});

test("billing: getPlanForUser fetches from user_entitlements", () => {
  assert.match(PLAN_GUARDS, /getPlanForUser/, "getPlanForUser function");
  assert.match(PLAN_GUARDS, /user_entitlements/, "queries user_entitlements table");
  assert.match(PLAN_GUARDS, /plan/, "selects plan column");
});

test("billing: enforceProjectLimit counts user projects", () => {
  assert.match(PLAN_GUARDS, /countProjects/, "counts projects");
  assert.match(PLAN_GUARDS, /owner_id/, "filters by owner_id");
  assert.match(PLAN_GUARDS, /archived_at/, "excludes archived");
});

test("billing: enforceOperatorLimit counts live operators in project", () => {
  assert.match(PLAN_GUARDS, /countLiveOperators/, "counts live operators");
  assert.match(PLAN_GUARDS, /operator_session_heartbeat_at/, "checks heartbeat freshness");
  assert.match(PLAN_GUARDS, /STALE_THRESHOLD_MS/, "stale threshold");
});

test("billing: enforceRequestLimit counts today's requests", () => {
  assert.match(PLAN_GUARDS, /countTodayRequests/, "counts today's requests");
  assert.match(PLAN_GUARDS, /maxRequestsPerDay/, "checks maxRequestsPerDay limit");
});

test("billing: guards return { ok: false, message } with upgrade hint", () => {
  assert.match(PLAN_GUARDS, /ok: false/, "returns ok: false when limit hit");
  assert.match(PLAN_GUARDS, /Passez.*forfait/, "upgrade message");
  assert.match(PLAN_GUARDS, /Limite atteinte/, "limit reached message");
});

test("billing: createProject checks enforceProjectLimit", () => {
  assert.match(ACTIONS, /enforceProjectLimit\(user\.id\)/, "project guard in createProject");
  assert.match(ACTIONS, /PLAN GUARD.*project limit/, "plan guard comment");
});

test("billing: activateOperatorElevator checks enforceOperatorLimit", () => {
  assert.match(ACTIONS, /enforceOperatorLimit\(projectId\)/, "operator guard in activate");
  assert.match(ACTIONS, /PLAN GUARD.*operator limit/, "plan guard comment");
});

test("billing: createPassengerRequest checks enforceRequestLimit", () => {
  assert.match(ACTIONS, /enforceRequestLimit\(projectId\)/, "request guard in createPassengerRequest");
  assert.match(ACTIONS, /PLAN GUARD.*request limit/, "plan guard comment");
});

// ═══════════════════════════════════════════════════════════════════
// 17. Free plan has daily request limit
// ═══════════════════════════════════════════════════════════════════

test("billing: Free (legacy) mapped to Starter has no daily request limit", () => {
  assert.match(PLANS, /effectivePlanId/, "effectivePlanId function maps free → starter");
  assert.doesNotMatch(PLANS, /free.*maxRequestsPerDay: 20/, "Free no longer has 20 req/day limit");
});

test("billing: Starter+ plans have no daily request limit", () => {
  const starterSection = PLANS.match(/starter: \{[\s\S]*?\n\}/)?.[0] ?? "";
  const proSection = PLANS.match(/pro: \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(starterSection, /maxRequestsPerDay: null/, "Starter unlimited requests");
  assert.match(proSection, /maxRequestsPerDay: null/, "Pro unlimited requests");
});

test("billing: canCreateRequest function exists in entitlements", () => {
  assert.match(ENTITLEMENTS, /canCreateRequest/, "canCreateRequest function");
  assert.match(ENTITLEMENTS, /maxRequestsPerDay/, "uses maxRequestsPerDay");
});

test("billing: effectiveMaxRequestsPerDay helper exists", () => {
  assert.match(ENTITLEMENTS, /effectiveMaxRequestsPerDay/, "effectiveMaxRequestsPerDay function");
});
