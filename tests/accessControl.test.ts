/**
 * Access control — targeted tests.
 *
 * Bug: Any authenticated user could access /operator and /admin pages.
 * New signups got account_role="admin" by default — no way to restrict
 * operator or admin terminals.
 *
 * Fix:
 * - Add "operator" to AccountRole (operator, admin, superadmin)
 * - roleForEmail returns "operator" by default (not "admin")
 * - requireOperator() guard: operator/admin/superadmin only
 * - requireAdmin() guard: admin/superadmin only
 * - Operator page uses requireOperator()
 * - Admin pages use requireAdmin()
 * - Passenger pages remain unauthenticated (QR flow)
 *
 * Tests:
 * 1. AccountRole includes operator + admin + superadmin
 * 2. roleForEmail defaults to "operator", not "admin"
 * 3. requireOperator and requireAdmin guards exist with correct role lists
 * 4. Operator page uses requireOperator
 * 5. Admin pages use requireAdmin, passenger page has no auth guard
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. AccountRole includes operator + admin + superadmin
// ---------------------------------------------------------------------------
test("access: AccountRole type includes operator, admin, superadmin", () => {
  const profile = readFileSync(join(root, "lib/profile.ts"), "utf8");
  assert.match(profile, /"operator"/, "operator role exists");
  assert.match(profile, /"admin"/, "admin role exists");
  assert.match(profile, /"superadmin"/, "superadmin role exists");
});

// ---------------------------------------------------------------------------
// 2. roleForEmail defaults to "operator", not "admin"
// ---------------------------------------------------------------------------
test("access: roleForEmail returns operator by default, superadmin for whitelisted", () => {
  const profile = readFileSync(join(root, "lib/profile.ts"), "utf8");
  // Default return is "operator" not "admin"
  assert.match(profile, /superadminEmails.*\?.*"superadmin".*:.*"operator"/, "default role is operator");
});

// ---------------------------------------------------------------------------
// 3. requireOperator and requireAdmin guards exist with correct role lists
// ---------------------------------------------------------------------------
test("access: requireOperator and requireAdmin guards with role checks", () => {
  const auth = readFileSync(join(root, "lib/auth.ts"), "utf8");
  assert.match(auth, /requireOperator/, "requireOperator function exists");
  assert.match(auth, /requireAdmin/, "requireAdmin function exists");
  // Operator allows operator + admin + superadmin
  assert.match(auth, /OPERATOR_ROLES/, "OPERATOR_ROLES defined");
  assert.match(auth, /operator.*admin.*superadmin|OPERATOR_ROLES.*operator/, "operator role in OPERATOR_ROLES");
  // Admin allows admin + superadmin only
  assert.match(auth, /ADMIN_ROLES/, "ADMIN_ROLES defined");
  assert.match(auth, /ADMIN_ROLES.*"admin"/, "admin in ADMIN_ROLES");
  // Both redirect to /admin/login if unauthorized
  assert.match(auth, /requireOperator[\s\S]{0,500}redirect/, "requireOperator redirects on failure");
  assert.match(auth, /requireAdmin[\s\S]{0,500}redirect/, "requireAdmin redirects on failure");
});

// ---------------------------------------------------------------------------
// 4. Operator page uses requireOperator
// ---------------------------------------------------------------------------
test("access: operator page uses requireOperator guard", () => {
  const page = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
  assert.match(page, /requireOperator/, "uses requireOperator");
  assert.ok(!page.includes("requireUser("), "no longer uses requireUser");
});

// ---------------------------------------------------------------------------
// 5. Admin pages use requireAdmin, passenger page has no auth guard
// ---------------------------------------------------------------------------
test("access: admin pages use requireAdmin, passenger page unguarded", () => {
  const adminPage = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
  assert.match(adminPage, /requireAdmin/, "admin page uses requireAdmin");
  assert.ok(!adminPage.includes("requireUser("), "admin page no longer uses requireUser");

  const requestPage = readFileSync(join(root, "app/request/page.tsx"), "utf8");
  assert.ok(!requestPage.includes("requireUser"), "passenger page has no requireUser");
  assert.ok(!requestPage.includes("requireAdmin"), "passenger page has no requireAdmin");
  assert.ok(!requestPage.includes("requireOperator"), "passenger page has no requireOperator");
});
