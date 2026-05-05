/**
 * Routing principal — pas de landing page, scan direct, Administration link.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const HOME = readFileSync(join(root, "app/page.tsx"), "utf8");
const SCAN_PAGE = readFileSync(join(root, "app/scan/page.tsx"), "utf8");
const SCAN_HOME = readFileSync(join(root, "components/ScanHome.tsx"), "utf8");
const REQUEST_PAGE = readFileSync(join(root, "app/request/page.tsx"), "utf8");
const LOGIN_PAGE = readFileSync(join(root, "app/admin/login/page.tsx"), "utf8");
const I18N = readFileSync(join(root, "lib/i18n.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// 1. / renders ScanHome directly — no landing page
// ═══════════════════════════════════════════════════════════════════════════

test("routing: / renders ScanHome directly (no landing page, no server redirect)", () => {
  assert.match(HOME, /ScanHome/, "/ renders ScanHome component directly");
  assert.doesNotMatch(HOME, /HomeContent/, "/ does NOT render HomeContent");
  assert.doesNotMatch(HOME, /from "next\/navigation"/, "/ does NOT import next/navigation redirect");
});

test("routing: /scan page renders ScanHome", () => {
  assert.match(SCAN_PAGE, /ScanHome/, "/scan renders ScanHome component");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Administration link on scan page
// ═══════════════════════════════════════════════════════════════════════════

test("routing: Administration link exists on scan page", () => {
  assert.match(SCAN_HOME, /admin\/login/, "scan page links to /admin/login");
  assert.match(SCAN_HOME, /scan\.admin/, "uses scan.admin i18n key");
});

test("routing: scan.admin i18n key exists in FR and EN", () => {
  assert.match(I18N, /"scan\.admin"/, "scan.admin key exists");
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Admin login redirects based on role
// ═══════════════════════════════════════════════════════════════════════════

test("routing: admin login redirects operators to /operator", () => {
  assert.match(LOGIN_PAGE, /operator/, "operator role redirects to /operator");
});

test("routing: admin login redirects admins to /admin", () => {
  assert.match(LOGIN_PAGE, /redirect.*\/admin"/, "admin role redirects to /admin");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Billing/paywall hidden at passenger startup
// ═══════════════════════════════════════════════════════════════════════════

test("routing: scan page has no billing/paywall references", () => {
  assert.doesNotMatch(SCAN_HOME, /paywall|Paywall|billing|planGuards|subscription/i, "no billing in scan");
});

test("routing: request page has no billing/paywall references", () => {
  assert.doesNotMatch(REQUEST_PAGE, /paywall|Paywall|billing|planGuards|subscription/i, "no billing in request page");
});
