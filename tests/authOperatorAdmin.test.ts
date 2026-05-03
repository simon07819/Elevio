/**
 * Auth operator/admin guards — targeted tests.
 *
 * Bug: Any authenticated user could access /operator and /admin.
 * New signups got account_role="admin" by default — no way to
 * restrict operator or admin terminals before App Store launch.
 *
 * Fix:
 * - Add "operator" to AccountRole (operator, admin, superadmin)
 * - roleForEmail defaults to "operator" (not "admin")
 * - requireOperator(): requires auth + operator/admin/superadmin
 * - requireAdmin(): requires auth + admin/superadmin
 * - Operator page uses requireOperator()
 * - Admin pages use requireAdmin()
 * - Passenger/request page remains unguarded (QR flow)
 * - Both guards redirect to /admin/login if unauthorized
 *
 * Tests:
 * 1. AccountRole includes operator + roleForEmail defaults to operator
 * 2. requireOperator and requireAdmin guards with role lists
 * 3. Operator page uses requireOperator
 * 4. Admin pages use requireAdmin
 * 5. Passenger page has no auth guard
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. AccountRole includes operator + roleForEmail defaults to operator
// ---------------------------------------------------------------------------
test("auth: AccountRole includes operator, admin, superadmin; default is operator", () => {
  const profile = readFileSync(join(root, "lib/profile.ts"), "utf8");
  assert.match(profile, /"operator"/, "operator role exists");
  assert.match(profile, /"admin"/, "admin role exists");
  assert.match(profile, /"superadmin"/, "superadmin role exists");
  // Default is operator (not admin)
  assert.match(profile, /superadmin.*"operator"/, "default role is operator");
  // Ensure no "admin" default after superadmin check
  const roleLine = profile.match(/superadminEmails\(\)\.includes[^?]+\?\s*"superadmin"\s*:\s*"(\w+)"/);
  assert.equal(roleLine?.[1], "operator", "fallback role is operator");
});

// ---------------------------------------------------------------------------
// 2. requireOperator and requireAdmin guards with role lists
// ---------------------------------------------------------------------------
test("auth: requireOperator and requireAdmin with correct role checks + redirect", () => {
  const auth = readFileSync(join(root, "lib/auth.ts"), "utf8");
  assert.match(auth, /requireOperator/, "requireOperator function exists");
  assert.match(auth, /requireAdmin/, "requireAdmin function exists");
  assert.match(auth, /OPERATOR_ROLES/, "OPERATOR_ROLES defined");
  assert.match(auth, /ADMIN_ROLES/, "ADMIN_ROLES defined");
  // Both redirect to /admin/login on failure
  assert.match(auth, /requireOperator[\s\S]{0,500}redirect/, "requireOperator redirects");
  assert.match(auth, /requireAdmin[\s\S]{0,500}redirect/, "requireAdmin redirects");
});

// ---------------------------------------------------------------------------
// 3. Operator page uses requireOperator
// ---------------------------------------------------------------------------
test("auth: operator page uses requireOperator guard", () => {
  const page = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
  assert.match(page, /requireOperator/, "uses requireOperator");
  assert.ok(!page.includes("requireUser("), "no longer uses bare requireUser");
});

// ---------------------------------------------------------------------------
// 4. Admin pages use requireAdmin
// ---------------------------------------------------------------------------
test("auth: admin pages use requireAdmin guard", () => {
  const adminPage = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
  assert.match(adminPage, /requireAdmin/, "admin page uses requireAdmin");
  assert.ok(!adminPage.includes("requireUser("), "admin page no longer uses requireUser");
});

// ---------------------------------------------------------------------------
// 5. Passenger page has no auth guard
// ---------------------------------------------------------------------------
test("auth: passenger request page is unguarded", () => {
  const page = readFileSync(join(root, "app/request/page.tsx"), "utf8");
  assert.ok(!page.includes("requireUser"), "no requireUser");
  assert.ok(!page.includes("requireAdmin"), "no requireAdmin");
  assert.ok(!page.includes("requireOperator"), "no requireOperator");
  assert.ok(!page.includes("getCurrentUser"), "no getCurrentUser");
});
