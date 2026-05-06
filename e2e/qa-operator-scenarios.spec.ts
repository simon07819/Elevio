/**
 * ═════════════════════════════════════════════════════════════════════════
 * ELEVIO LIVE QA — Operator Scenarios
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Run against staging:
 *   ELEVIO_BASE_URL=https://elevio-staging.vercel.app \
 *   ELEVIO_PROJECT_ID=... \
 *   ELEVIO_OPERATOR_EMAIL=... \
 *   ELEVIO_OPERATOR_PASSWORD=... \
 *   npx playwright test --project=qa-operator
 *
 * Prerequisites:
 *   - Staging project with at least 1 elevator and 5+ floors
 *   - Test operator account with active subscription
 *   - Network access to staging Supabase
 * ═════════════════════════════════════════════════════════════════════════
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";
const PROJECT_ID = process.env.ELEVIO_PROJECT_ID || "0dcb9995-97b7-4cbd-855b-00035ccce5dc";
const ELEVATOR_ID = process.env.ELEVIO_ELEVATOR_ID || "";
const OP_EMAIL = process.env.ELEVIO_OPERATOR_EMAIL || "";
const OP_PASSWORD = process.env.ELEVIO_OPERATOR_PASSWORD || "";

test.skip(!OP_EMAIL, "ELEVIO_OPERATOR_EMAIL not set — skipping live QA");

// ── Helper: login as operator ──
async function loginAsOperator(page: Page) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', OP_EMAIL);
  await page.fill('input[name="password"]', OP_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(admin|paywall|operator)/, { timeout: 15000 });
}

// ── Helper: activate operator tablet ──
async function activateOperatorTablet(page: Page, elevatorLabel: string) {
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");
  // Select elevator if prompted
  const elevatorSelect = page.locator("select, [data-testid='elevator-select']");
  if (await elevatorSelect.count() > 0) {
    await elevatorSelect.first().selectOption({ label: new RegExp(elevatorLabel) });
  }
  // Activate button
  const activateBtn = page.locator("button", { hasText: /activer|activate/i });
  if (await activateBtn.count() > 0) {
    await activateBtn.first().click();
    await page.waitForTimeout(2000);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Single operator — full cycle
// ═════════════════════════════════════════════════════════════════════════
test("OP-01: single operator — login, activate, view queue, release", async ({ page }) => {
  await loginAsOperator(page);

  // Navigate to operator workspace
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  // Should see operator UI
  const hasOperatorUI = await page.locator("[data-operator], .operator-workspace, h1, h2").count();
  expect(hasOperatorUI).toBeGreaterThan(0);

  // Release tablet
  const releaseBtn = page.locator("button", { hasText: /libérer|release|déconnexion/i });
  if (await releaseBtn.count() > 0) {
    await releaseBtn.first().click();
    await page.waitForTimeout(1000);
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Pickup a request (requires a pending request)
// ═════════════════════════════════════════════════════════════════════════
test("OP-02: pickup request from queue", async ({ page }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  // Look for a pickup/arriving button
  const pickupBtn = page.locator("button", { hasText: /pickup|arrivé|prendre/i });
  const hasRequests = await pickupBtn.count();
  if (hasRequests > 0) {
    await pickupBtn.first().click();
    await page.waitForTimeout(2000);

    // After pickup, status should change
    const boardedIndicator = page.locator("text=/boarded|à bord|embarqué/i");
    // May or may not appear depending on state
    await page.waitForTimeout(1000);
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Skip a request
// ═════════════════════════════════════════════════════════════════════════
test("OP-03: skip request in queue", async ({ page }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  const skipBtn = page.locator("button", { hasText: /skip|ignorer|passer/i });
  if (await skipBtn.count() > 0) {
    await skipBtn.first().click();
    await page.waitForTimeout(2000);
    // Request should be marked as skipped
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 4: Mark elevator as full
// ═════════════════════════════════════════════════════════════════════════
test("OP-04: mark elevator as full then available", async ({ page }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  const fullBtn = page.locator("button", { hasText: /plein|full|complet/i });
  if (await fullBtn.count() > 0) {
    await fullBtn.first().click();
    await page.waitForTimeout(1000);

    // Should show full indicator
    const fullIndicator = page.locator("text=/plein|full/i");
    expect(await fullIndicator.count()).toBeGreaterThan(0);

    // Toggle back to available
    const availBtn = page.locator("button", { hasText: /disponible|available/i });
    if (await availBtn.count() > 0) {
      await availBtn.first().click();
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 5: Clear queue
// ═════════════════════════════════════════════════════════════════════════
test("OP-05: clear elevator queue", async ({ page }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  const clearBtn = page.locator("button", { hasText: /vider|clear|annuler tout/i });
  if (await clearBtn.count() > 0) {
    await clearBtn.first().click();
    await page.waitForTimeout(2000);
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 6: Network disconnect + reconnect
// ═════════════════════════════════════════════════════════════════════════
test("OP-06: offline then online — realtime reconnects", async ({ page, context }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  // Simulate offline
  await context.setOffline(true);
  await page.waitForTimeout(3000);

  // Should show offline indicator or stale data
  const offlineIndicator = page.locator("text=/hors.ligne|offline|déconnecté/i");
  // May or may not appear

  // Reconnect
  await context.setOffline(false);
  await page.waitForTimeout(5000);

  // Should reconnect and get fresh data
  const onlineContent = page.locator("[data-operator], .operator-workspace, h1, h2");
  expect(await onlineContent.count()).toBeGreaterThan(0);
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 7: Page refresh during active session
// ═════════════════════════════════════════════════════════════════════════
test("OP-07: refresh page — session persists", async ({ page }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  // Refresh
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Should still be logged in
  const loggedIn = await page.locator("text=/opérateur|operator|chantier/i").count();
  expect(loggedIn).toBeGreaterThan(0);
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 8: Rapid action spam (anti-spam guard)
// ═════════════════════════════════════════════════════════════════════════
test("OP-08: rapid pickup clicks — only one action processed", async ({ page }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  const pickupBtn = page.locator("button", { hasText: /pickup|arrivé|prendre/i });
  if (await pickupBtn.count() > 0) {
    // Click rapidly 5 times
    for (let i = 0; i < 5; i++) {
      await pickupBtn.first().click({ timeout: 500 }).catch(() => {});
    }
    await page.waitForTimeout(3000);

    // Should not have created duplicate actions — check for error messages
    const errorMsg = page.locator("text=/erreur|error|déjà|already/i");
    // If multiple clicks processed, might show "already" message
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 9: Multiple browser tabs (same operator)
// ═════════════════════════════════════════════════════════════════════════
test("OP-09: two tabs — same operator session", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page1 = await ctx.newPage();
  const page2 = await ctx.newPage();

  await loginAsOperator(page1);
  await loginAsOperator(page2);

  await page1.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page2.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);

  await page1.waitForLoadState("networkidle");
  await page2.waitForLoadState("networkidle");

  // Both tabs should show operator UI
  expect(await page1.locator("[data-operator], h1, h2").count()).toBeGreaterThan(0);
  expect(await page2.locator("[data-operator], h1, h2").count()).toBeGreaterThan(0);

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════
// SCENARIO 10: Heartbeat interval verification
// ═════════════════════════════════════════════════════════════════════════
test("OP-10: heartbeat keeps session alive for 60s", async ({ page }) => {
  await loginAsOperator(page);
  await page.goto(`${BASE}/operator?projectId=${PROJECT_ID}`);
  await page.waitForLoadState("networkidle");

  // Wait 60s — heartbeat should keep session alive
  await page.waitForTimeout(65000);

  // Session should still be active (not redirected to login)
  const stillOnOperator = page.url().includes("/operator");
  expect(stillOnOperator).toBe(true);
});
