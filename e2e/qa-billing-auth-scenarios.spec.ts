/**
 * ═════════════════════════════════════════════════════════════════════════
 * ELEVIO LIVE QA — Billing + Auth Scenarios
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Run against staging:
 *   ELEVIO_BASE_URL=https://elevio-staging.vercel.app \
 *   ELEVIO_OPERATOR_EMAIL=... \
 *   ELEVIO_OPERATOR_PASSWORD=... \
 *   npx playwright test --project=qa-billing
 * ═════════════════════════════════════════════════════════════════════════
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";
const OP_EMAIL = process.env.ELEVIO_OPERATOR_EMAIL || "";
const OP_PASSWORD = process.env.ELEVIO_OPERATOR_PASSWORD || "";
const TEST_EMAIL = `qa-test-${Date.now()}@elevio-staging.test`;
const TEST_PASSWORD = "TestPass123!";

test.skip(!OP_EMAIL, "ELEVIO_OPERATOR_EMAIL not set — skipping live QA");

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Sign up new account
// ═════════════════════════════════════════════════════════════════════════
test("BL-01: sign up new account — redirected to paywall", async ({ page }) => {
  await page.goto(`${BASE}/admin/login`);
  const signUpLink = page.locator("a", { hasText: /créer|sign.up|inscrire|compte/i });
  if (await signUpLink.count() > 0) {
    await signUpLink.first().click();
    await page.waitForLoadState("networkidle");

    // Fill signup form
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.fill('input[name="firstName"]', "QA");
    await page.fill('input[name="lastName"]', "Test");
    await page.fill('input[name="company"]', "QA Testing Corp");
    await page.fill('input[name="phone"]', "514-555-0000");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(paywall|admin)/, { timeout: 15000 });

    // New user should hit paywall
    const url = page.url();
    expect(url).toContain("paywall");
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Login with existing account
// ═════════════════════════════════════════════════════════════════════════
test("BL-02: login existing operator — access granted", async ({ page }) => {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', OP_EMAIL);
  await page.fill('input[name="password"]', OP_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(admin|operator|paywall|superadmin)/, { timeout: 15000 });

  const url = page.url();
  // Should NOT be on login page
  expect(url).not.toContain("/login");
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Invalid login credentials
// ═════════════════════════════════════════════════════════════════════════
test("BL-03: invalid credentials — error message", async ({ page }) => {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', "wrong@example.com");
  await page.fill('input[name="password"]', "WrongPassword123");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  const errorMsg = page.locator("text=/invalid|incorrect|erreur|error/i");
  expect(await errorMsg.count()).toBeGreaterThan(0);
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 4: Paywall — subscription required
// ═════════════════════════════════════════════════════════════════════════
test("BL-04: paywall shows subscription options", async ({ page }) => {
  await page.goto(`${BASE}/paywall`);
  await page.waitForLoadState("networkidle");

  // Should show plan options
  const planOptions = page.locator("text=/starter|pro|forfait|plan|abonnement/i");
  expect(await planOptions.count()).toBeGreaterThan(0);
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 5: Sign out
// ═════════════════════════════════════════════════════════════════════════
test("BL-05: sign out — redirected to home", async ({ page }) => {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', OP_EMAIL);
  await page.fill('input[name="password"]', OP_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(admin|operator|paywall|superadmin)/, { timeout: 15000 });

  // Find sign out button
  const signOutBtn = page.locator("button", { hasText: /déconnexion|sign.out|logout/i });
  if (await signOutBtn.count() > 0) {
    await signOutBtn.first().click();
    await page.waitForTimeout(2000);
    // Should be on home or login page
    expect(page.url()).not.toContain("/admin");
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 6: Auth redirect loop prevention
// ═════════════════════════════════════════════════════════════════════════
test("BL-06: no redirect loop between /admin/login and /paywall", async ({ page }) => {
  // Visit login page
  await page.goto(`${BASE}/admin/login`);
  await page.waitForLoadState("networkidle");

  // Should stay on login page (not redirect to paywall)
  const url1 = page.url();
  expect(url1).toContain("/admin/login");

  // Visit paywall directly
  await page.goto(`${BASE}/paywall`);
  await page.waitForLoadState("networkidle");

  // Should stay on paywall (not redirect back to login in a loop)
  const url2 = page.url();
  expect(url2).toContain("/paywall");
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 7: Protected route access without auth
// ═════════════════════════════════════════════════════════════════════════
test("BL-07: protected routes redirect to login without auth", async ({ page }) => {
  // Try to access admin directly
  await page.goto(`${BASE}/admin/projects`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Should be redirected to login
  expect(page.url()).toContain("/login");
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 8: Superadmin access
// ═════════════════════════════════════════════════════════════════════════
test("BL-08: superadmin route requires superadmin role", async ({ page }) => {
  await page.goto(`${BASE}/superadmin`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Should be redirected to login (not superadmin content)
  expect(page.url()).toContain("/login");
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 9: Webhook validation — rejects unauthorized
// ═════════════════════════════════════════════════════════════════════════
test("BL-09: RevenueCat webhook rejects without auth token", async ({ page }) => {
  const response = await page.request.post(`${BASE}/api/revenuecat/webhook`, {
    data: { event: { type: "TEST" } },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.status()).toBe(401);
});

test("BL-10: Stripe webhook rejects without signature", async ({ page }) => {
  const response = await page.request.post(`${BASE}/api/stripe/webhook`, {
    data: { type: "payment_intent.succeeded" },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.status()).toBe(400);
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 11: Cron routes reject without auth
// ═════════════════════════════════════════════════════════════════════════
test("BL-11: cron routes reject without secret or Vercel header", async ({ page }) => {
  const cleanupRes = await page.request.post(`${BASE}/api/cron/cleanup-requests`);
  expect([401, 500]).toContain(cleanupRes.status());

  const statsRes = await page.request.post(`${BASE}/api/cron/compute-stats`);
  expect([401, 500]).toContain(statsRes.status());
});
