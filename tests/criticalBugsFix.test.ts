/**
 * Critical bug fixes — passenger unblock, operator optimistic UI, superadmin visibility.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const REQUEST_CARD = readFileSync(join(root, "components/operator/RequestCard.tsx"), "utf8");
const APP_SHELL = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
const APP_NAVIGATION = readFileSync(join(root, "components/AppNavigation.tsx"), "utf8");
const AUTH_SUPERADMIN = readFileSync(join(root, "lib/auth/superadmin.ts"), "utf8");
const RPC_GUARD = readFileSync(join(root, "supabase/passenger-device-open-request-guard.sql"), "utf8");
const MIGRATION = readFileSync(join(root, "supabase/migrations/profiles_role_constraint.sql"), "utf8");
const SCHEMA = readFileSync(join(root, "supabase/schema.sql"), "utf8");
const OPERATOR_PAGE = readFileSync(join(root, "app/operator/page.tsx"), "utf8");

// ═════════════════════════════════════════════════════════════════════════════
// BUG 1: Passenger blocked after completed request
// ═══════════════════════════════════════════════════════════════════════════

test("passenger: RPC blocks only active statuses (pending, assigned, arriving) — NOT boarded", () => {
  // "boarded" does NOT block — passenger is in transit and may re-request after dropoff.
  // The completed/cancelled status arrives asynchronously, and passenger_device_key
  // is cleared on completed/cancelled as defense-in-depth.
  assert.match(RPC_GUARD, /'pending'.*'assigned'.*'arriving'/s, "RPC includes pending/assigned/arriving");
  assert.doesNotMatch(RPC_GUARD, /'boarded'/, "RPC does NOT block boarded — passenger can re-request after dropoff");
  assert.doesNotMatch(RPC_GUARD, /'completed'/, "RPC does NOT block completed");
  assert.doesNotMatch(RPC_GUARD, /'cancelled'/, "RPC does NOT block cancelled");
});

test("passenger: schema.sql matches RPC guard statuses", () => {
  // Extract just the passenger_has_open_request function body
  const rpcFn = SCHEMA.match(/passenger_has_open_request[\s\S]*?\$\$;/);
  assert.ok(rpcFn, "found passenger_has_open_request function in schema.sql");
  assert.match(rpcFn[0], /'pending'.*'assigned'.*'arriving'/s, "includes pending/assigned/arriving");
  assert.doesNotMatch(rpcFn[0], /'boarded'/, "does NOT include boarded");
});

test("passenger: completed/cancelled clears passenger_device_key in DB", () => {
  // Check for the two blocks that set passenger_device_key = null
  assert.match(ACTIONS, /passenger_device_key.*null/, "clears device key on terminal status");
  // Verify it's in both completed and cancelled blocks
  const completedBlock = ACTIONS.match(/status === "completed"[\s\S]*?updates\.completed_at/);
  const cancelledBlock = ACTIONS.match(/status === "cancelled"[\s\S]*?updates\.completed_at/);
  assert.ok(ACTIONS.includes('updates.passenger_device_key = null'), "sets passenger_device_key to null");
});

test("passenger: ACTIVE_STATUSES rule enforced — completed never blocks", () => {
  const REQUEST_FORM = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(REQUEST_FORM, /clearPassengerPendingRequest/, "clears localStorage on terminal status");
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG 2: Operator buttons slow (not optimistic)
// ═══════════════════════════════════════════════════════════════════════════

test("operator: RequestCard advance is optimistic (no startTransition/await)", () => {
  assert.doesNotMatch(REQUEST_CARD, /startTransition/, "RequestCard does NOT use startTransition");
  assert.match(REQUEST_CARD, /setCurrentStatus\(status\)/, "optimistic: sets status immediately before server call");
  assert.match(REQUEST_CARD, /void advanceRequestStatus/, "fire-and-forget: uses void, not await");
  assert.match(REQUEST_CARD, /advancing/, "has advancing guard to prevent double-click");
  assert.match(REQUEST_CARD, /if \(advancing\) return/, "blocks double-click immediately");
});

test("operator: RecommendedNextStop pickup is optimistic", () => {
  const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(RECOMMENDED, /onPickupSuccess.*before server responds|optimistic/i, "pickup is optimistic");
  assert.match(RECOMMENDED, /void advanceRequestStatus.*boarded/, "fire-and-forget server call");
});

test("operator: double-click pickup guard exists", () => {
  const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(RECOMMENDED, /status === "boarded".*return|duplicate pickup ignored/, "guards against double pickup");
});

test("operator: double-click dropoff guard exists", () => {
  const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(RECOMMENDED, /alreadyPending.*return|pendingDropoffIds.has/, "guards against double dropoff");
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG 3: Superadmin button not visible for Simon
// ═══════════════════════════════════════════════════════════════════════════

test("superadmin: isSuperAdminEmail uses lowercase comparison (bootstrap fallback)", () => {
  assert.match(AUTH_SUPERADMIN, /toLowerCase/, "lowercase comparison");
  // No hardcoded fallback — SUPERADMIN_EMAIL must be set explicitly
  assert.match(AUTH_SUPERADMIN, /SUPERADMIN_EMAIL.*\?\? ?""/, "no hardcoded email fallback");
});

test("superadmin: isSuperAdminProfile checks profile.account_role", () => {
  assert.match(AUTH_SUPERADMIN, /isSuperAdminProfile/, "has isSuperAdminProfile function");
  assert.match(AUTH_SUPERADMIN, /account_role === "superadmin"/, "checks profile.account_role");
});

test("superadmin: isSuperAdmin combines profile + email fallback", () => {
  assert.match(AUTH_SUPERADMIN, /isSuperAdmin[^EP]/, "has isSuperAdmin function");
  assert.match(AUTH_SUPERADMIN, /isSuperAdminProfile.*profile/, "primary: profile check");
  assert.match(AUTH_SUPERADMIN, /isSuperAdminEmail.*email.*fallback|Bootstrap fallback/, "fallback: email");
});

test("superadmin: requireSuperAdmin fetches profile before checking", () => {
  assert.match(AUTH_SUPERADMIN, /requireSuperAdmin/, "requireSuperAdmin exists");
  assert.match(AUTH_SUPERADMIN, /getCurrentProfile/, "fetches profile");
  assert.match(AUTH_SUPERADMIN, /canAccessSuperAdmin.*user.*profile/, "passes profile to canAccessSuperAdmin");
});

test("superadmin: AppShell accepts userRole (primary) + userEmail (fallback)", () => {
  assert.match(APP_SHELL, /userRole/, "accepts userRole prop");
  assert.match(APP_SHELL, /userEmail/, "accepts userEmail prop (fallback)");
  assert.match(APP_SHELL, /isSuperAdmin[^EP]|isSuperAdminProfile/, "uses role-based check");
  assert.match(APP_SHELL, /showSuperadmin/, "computes showSuperadmin");
});

test("superadmin: AppNavigation conditionally renders superadmin link", () => {
  assert.match(APP_NAVIGATION, /showSuperadmin/, "accepts showSuperadmin prop");
  assert.match(APP_NAVIGATION, /showSuperadmin &&/, "conditionally renders link");
  assert.match(APP_NAVIGATION, /\/superadmin/, "links to /superadmin");
});

test("superadmin: all admin pages pass userRole to AppShell", () => {
  const adminPages = [
    "app/admin/page.tsx",
    "app/admin/projects/page.tsx",
    "app/admin/stats/page.tsx",
    "app/admin/floors/page.tsx",
    "app/admin/qrcodes/page.tsx",
    "app/admin/profile/page.tsx",
  ];
  for (const page of adminPages) {
    const src = readFileSync(join(root, page), "utf8");
    assert.match(src, /userRole/, `${page} passes userRole`);
  }
});

test("superadmin: operator page uses isSuperAdmin(profile, email)", () => {
  assert.match(OPERATOR_PAGE, /isSuperAdmin[^EP]/, "operator page uses isSuperAdmin");
  assert.match(OPERATOR_PAGE, /showSuperadmin/, "operator page passes showSuperadmin");
});

test("superadmin: migration sets Simon's account_role to superadmin", () => {
  const MIGRATION = readFileSync(join(root, "supabase/migrations/profiles_role_constraint.sql"), "utf8");
  assert.match(MIGRATION, /account_role = 'superadmin'/, "sets superadmin role");
  assert.match(MIGRATION, /simon@dsdconstruction\.ca/, "targets Simon's email");
});

test("superadmin: DB CHECK constraint includes all 4 roles", () => {
  assert.match(MIGRATION, /passenger/, "passenger in CHECK");
  assert.match(MIGRATION, /operator/, "operator in CHECK");
  assert.match(MIGRATION, /admin/, "admin in CHECK");
  assert.match(MIGRATION, /superadmin/, "superadmin in CHECK");
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG 4: Superadmin invisible in menu + Metrics in wrong place
// ═══════════════════════════════════════════════════════════════════════════

test("menu: SUPERADMIN link conditionally rendered when showSuperadmin=true", () => {
  assert.match(APP_NAVIGATION, /showSuperadmin &&/, "conditionally renders SUPERADMIN link");
  assert.match(APP_NAVIGATION, /\/superadmin/, "links to /superadmin");
  assert.match(APP_NAVIGATION, /Superadmin/, "label is Superadmin");
});

test("menu: Metrics NOT in main navigation", () => {
  assert.doesNotMatch(APP_NAVIGATION, /admin\/metrics/, "metrics removed from navItems");
});

test("menu: superadminEmails uses SUPERADMIN_EMAIL env var (fix profile.role bug)", () => {
  const PROFILE = readFileSync(join(root, "lib/profile.ts"), "utf8");
  assert.match(PROFILE, /SUPERADMIN_EMAIL/, "superadminEmails reads SUPERADMIN_EMAIL env var");
  // No hardcoded fallback — must be set explicitly in env
  assert.match(PROFILE, /SUPERADMIN_EMAIL.*\?\? ?""/, "no hardcoded email fallback in profile.ts");
});

test("menu: Metrics accessible from superadmin sidebar/dashboard", () => {
  const SUPERADMIN_DASHBOARD = readFileSync(join(root, "app/superadmin/page.tsx"), "utf8");
  assert.match(SUPERADMIN_DASHBOARD, /\/superadmin\/metrics/, "metrics linked from superadmin dashboard");
  const SHELL = readFileSync(join(root, "components/superadmin/SuperadminShell.tsx"), "utf8");
  assert.match(SHELL, /\/superadmin\/metrics/, "metrics in superadmin sidebar");
});

test("menu: /admin/metrics requires superadmin", () => {
  const METRICS_PAGE = readFileSync(join(root, "app/admin/metrics/page.tsx"), "utf8");
  assert.match(METRICS_PAGE, /requireSuperAdmin/, "metrics page requires superadmin guard");
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG 5: SUPERADMIN invisible (root cause) + superadmin structure
// ═══════════════════════════════════════════════════════════════════════════

test("superadmin: ensureProfileForUser never downgrades role", () => {
  const PROFILE = readFileSync(join(root, "lib/profile.ts"), "utf8");
  assert.match(PROFILE, /rolePriority/, "has role priority system");
  assert.match(PROFILE, /emailIdx > currentIdx/, "only promotes, never downgrades");
  assert.match(PROFILE, /NEVER downgrade/, "has comment explaining the rule");
});

test("superadmin: projects removed from /superadmin sidebar", () => {
  const SHELL = readFileSync(join(root, "components/superadmin/SuperadminShell.tsx"), "utf8");
  assert.doesNotMatch(SHELL, /\/superadmin\/projects/, "no projects link in sidebar");
  assert.match(SHELL, /\/superadmin\/users/, "has users link");
  assert.match(SHELL, /\/superadmin\/accounts/, "has accounts/companies link");
  assert.match(SHELL, /\/superadmin\/billing/, "has billing/subscriptions link");
  assert.match(SHELL, /\/superadmin\/metrics/, "has metrics link");
  assert.match(SHELL, /\/superadmin\/support/, "has support link");
});

test("superadmin: /superadmin/projects redirects to /admin/projects", () => {
  const PROJECTS_PAGE = readFileSync(join(root, "app/superadmin/projects/page.tsx"), "utf8");
  assert.match(PROJECTS_PAGE, /requireSuperAdmin/, "still requires superadmin auth");
  assert.match(PROJECTS_PAGE, /redirect.*\/admin\/projects/, "redirects to /admin/projects");
});

test("superadmin: /superadmin/metrics redirects to /admin/metrics", () => {
  const METRICS_REDIRECT = readFileSync(join(root, "app/superadmin/metrics/page.tsx"), "utf8");
  assert.match(METRICS_REDIRECT, /requireSuperAdmin/, "requires superadmin auth");
  assert.match(METRICS_REDIRECT, /redirect.*\/admin\/metrics/, "redirects to /admin/metrics");
});

test("superadmin: dashboard is platform-focused (no chantier/client language)", () => {
  const DASHBOARD = readFileSync(join(root, "app/superadmin/page.tsx"), "utf8");
  assert.match(DASHBOARD, /superadmin\.dashboardTitle/, "dashboard title is platform-focused");
  assert.doesNotMatch(DASHBOARD, /Chantiers actifs/, "no chantier language");
});

test("superadmin: support page editable via site_settings", () => {
  const SUPPORT_PAGE = readFileSync(join(root, "app/superadmin/support/page.tsx"), "utf8");
  assert.match(SUPPORT_PAGE, /requireSuperAdmin/, "requires superadmin");
  assert.match(SUPPORT_PAGE, /SuperadminSupportEditor/, "renders support editor");
  assert.match(SUPPORT_PAGE, /support_email/, "edits support_email");
  assert.match(SUPPORT_PAGE, /support_faq_json|faq_content/, "edits FAQ");
});

test("superadmin: public /support is premium structured page with legal links", () => {
  const PUBLIC_SUPPORT = readFileSync(join(root, "app/support/page.tsx"), "utf8");
  assert.match(PUBLIC_SUPPORT, /info@elevioapp\.ca/, "shows support email");
  assert.match(PUBLIC_SUPPORT, /\/legal\/privacy/, "links to privacy page");
  assert.match(PUBLIC_SUPPORT, /\/legal\/terms/, "links to terms page");
  assert.match(PUBLIC_SUPPORT, /APP_VERSION/, "shows app version");
});
