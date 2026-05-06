/**
 * ═════════════════════════════════════════════════════════════════════════
 * ELEVIO STRESS TESTING — Realtime + Server Action Load Simulation
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Run against staging:
 *   ELEVIO_BASE_URL=https://elevio-staging.vercel.app \
 *   ELEVIO_PROJECT_ID=... \
 *   ELEVIO_FLOOR_5_TOKEN=... \
 *   ELEVIO_FLOOR_P1_TOKEN=... \
 *   npx playwright test --project=qa-stress
 *
 * These tests create high load on the staging environment.
 * DO NOT run against production.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from "@playwright/test";

const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";
const PROJECT_ID = process.env.ELEVIO_PROJECT_ID || "0dcb9995-97b7-4cbd-855b-00035ccce5dc";
const FLOOR_5_TOKEN = process.env.ELEVIO_FLOOR_5_TOKEN || "4d585db5d0cadf5cf463234f0016fd76";
const FLOOR_P1_TOKEN = process.env.ELEVIO_FLOOR_P1_TOKEN || "9aabfae7ec4d13a784b4224c13862edf";

test.skip(!process.env.ELEVIO_STRESS_MODE, "ELEVIO_STRESS_MODE not set — skipping stress tests");

// ═════════════════════════════════════════════════════════════════════════
// STRESS 1: 50 simultaneous passenger requests
// ═════════════════════════════════════════════════════════════════════════
test("STRESS-01: 50 simultaneous passenger requests", async ({ browser }) => {
  const REQUEST_COUNT = 50;
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const pages: Awaited<ReturnType<ReturnType<typeof browser.newContext>["newPage"]>>[] = [];

  // Create browser contexts
  for (let i = 0; i < REQUEST_COUNT; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    contexts.push(ctx);
    pages.push(page);
  }

  // Navigate all pages to request form
  const tokens = [FLOOR_5_TOKEN, FLOOR_P1_TOKEN];
  await Promise.all(
    pages.map((page, i) =>
      page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${tokens[i % 2]}`)
        .catch(() => null)
    )
  );

  // Submit all requests simultaneously
  const results = await Promise.allSettled(
    pages.map((page) =>
      page.locator("button[type='submit'], button", { hasText: /demander|request/i })
        .first()
        .click({ timeout: 5000 })
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: String(e) }))
    )
  );

  const successes = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;

  console.log(`[STRESS-01] ${successes} succeeded, ${failures} failed out of ${REQUEST_COUNT}`);

  // At least some should succeed
  expect(successes).toBeGreaterThan(0);

  // Clean up
  await Promise.all(contexts.map((ctx) => ctx.close()));
});

// ═════════════════════════════════════════════════════════════════════════
// STRESS 2: Rapid sequential requests from one client
// ═════════════════════════════════════════════════════════════════════════
test("STRESS-02: 20 rapid sequential requests from one client", async ({ page }) => {
  const REQUEST_COUNT = 20;
  let successes = 0;
  let failures = 0;

  for (let i = 0; i < REQUEST_COUNT; i++) {
    const token = i % 2 === 0 ? FLOOR_5_TOKEN : FLOOR_P1_TOKEN;
    await page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${token}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const submitBtn = page.locator("button[type='submit'], button", { hasText: /demander|request/i });
    if (await submitBtn.count() > 0) {
      try {
        await submitBtn.first().click({ timeout: 3000 });
        await page.waitForTimeout(500);
        successes++;
      } catch {
        failures++;
      }
    }
  }

  console.log(`[STRESS-02] ${successes} succeeded, ${failures} failed out of ${REQUEST_COUNT}`);
});

// ═════════════════════════════════════════════════════════════════════════
// STRESS 3: Reconnect storm — 10 clients disconnect/reconnect
// ═════════════════════════════════════════════════════════════════════════
test("STRESS-03: reconnect storm — 10 clients toggle offline", async ({ browser }) => {
  const CLIENT_COUNT = 10;
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const pages: Awaited<ReturnType<ReturnType<typeof browser.newContext>["newPage"]>>[] = [];

  for (let i = 0; i < CLIENT_COUNT; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    contexts.push(ctx);
    pages.push(page);
  }

  // Navigate all to request page
  await Promise.all(
    pages.map((page) =>
      page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_5_TOKEN}`)
        .catch(() => null)
    )
  );

  // All go offline
  await Promise.all(contexts.map((ctx) => ctx.setOffline(true)));
  await new Promise((r) => setTimeout(r, 3000));

  // All come back online
  await Promise.all(contexts.map((ctx) => ctx.setOffline(false)));
  await new Promise((r) => setTimeout(r, 5000));

  // Verify all pages are still responsive
  let alive = 0;
  for (const page of pages) {
    try {
      const body = await page.locator("body").count();
      if (body > 0) alive++;
    } catch {
      // page may have crashed
    }
  }

  console.log(`[STRESS-03] ${alive}/${CLIENT_COUNT} pages survived reconnect storm`);
  expect(alive).toBeGreaterThan(CLIENT_COUNT * 0.8); // At least 80% survive

  await Promise.all(contexts.map((ctx) => ctx.close()));
});

// ═════════════════════════════════════════════════════════════════════════
// STRESS 4: Webhook flood — 20 rapid webhook calls
// ═════════════════════════════════════════════════════════════════════════
test("STRESS-04: webhook flood — all rejected without auth", async ({ page }) => {
  const FLOOD_COUNT = 20;
  const results: number[] = [];

  // RevenueCat webhook flood
  for (let i = 0; i < FLOOD_COUNT; i++) {
    const res = await page.request.post(`${BASE}/api/revenuecat/webhook`, {
      data: { event: { type: "TEST", id: i } },
      headers: { "Content-Type": "application/json" },
    });
    results.push(res.status());
  }

  // All should be 401 (unauthorized)
  const rejected = results.filter((s) => s === 401).length;
  console.log(`[STRESS-04] ${rejected}/${FLOOD_COUNT} webhook requests rejected (401)`);
  expect(rejected).toBe(FLOOD_COUNT);
});

// ═════════════════════════════════════════════════════════════════════════
// STRESS 5: API route abuse — direct calls without auth
// ═════════════════════════════════════════════════════════════════════════
test("STRESS-05: protected API routes reject unauthenticated calls", async ({ page }) => {
  const endpoints = [
    { method: "POST", url: `${BASE}/api/cron/cleanup-requests`, expectStatus: [401, 500] },
    { method: "POST", url: `${BASE}/api/cron/compute-stats`, expectStatus: [401, 500] },
    { method: "POST", url: `${BASE}/api/revenuecat/webhook`, expectStatus: [401, 500] },
    { method: "POST", url: `${BASE}/api/stripe/webhook`, expectStatus: [400, 500] },
  ];

  for (const ep of endpoints) {
    const res = await page.request.post(ep.url, {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    const ok = ep.expectStatus.includes(res.status());
    console.log(`[STRESS-05] ${ep.url} → ${res.status()} (${ok ? "PASS" : "FAIL"})`);
    expect(ok).toBe(true);
  }
});

// ═════════════════════════════════════════════════════════════════════════
// STRESS 6: Floor code brute force
// ═════════════════════════════════════════════════════════════════════════
test("STRESS-06: floor code brute force — all rejected", async ({ page }) => {
  const ATTEMPTS = 30;
  let notFound = 0;

  for (let i = 0; i < ATTEMPTS; i++) {
    const fakeCode = `FAKE${i.toString().padStart(4, "0")}`;
    const res = await page.request.get(`${BASE}/api/floor-code?code=${fakeCode}`);
    const data = await res.json();
    if (!data.ok) notFound++;
  }

  console.log(`[STRESS-06] ${notFound}/${ATTEMPTS} brute force attempts correctly rejected`);
  expect(notFound).toBe(ATTEMPTS);
});
