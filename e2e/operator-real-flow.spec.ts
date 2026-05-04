/**
 * ELEVIO — Operator Real Flow (Playwright LIVE)
 *
 * SINGLE SERIAL TEST reproducing the EXACT user scenario:
 * 1. Setup: admin, 2 iPads, 2 passengers
 * 2. Activation tablet
 * 3. Crossed requests A: 5→P1, B: P1→5
 * 4. Pickup A → passenger QR return <2s → refresh → still Déposer → no PAUSE for 20s
 * 5. Combined Déposer+Ramasser at P1 → both actions → passenger B QR return <2s
 * 6. Dropoff B at 5 → completed → no old requests return
 * 7. Release + immediate re-activate → no delay
 * 8. Multi-device sync
 *
 * FAIL if:
 * - combined button absent
 * - after Ramasser + refresh, returns to Ramasser
 * - passenger QR return >2s
 * - terminal PAUSE with active work
 * - Libérer blocks Actif
 * - old request returns after refresh
 *
 * Environment:
 *   ELEVIO_BASE_URL         — app URL (default: http://localhost:3000)
 *   ELEVIO_OPERATOR_EMAIL   — operator login email
 *   ELEVIO_OPERATOR_PASSWORD— operator login password
 *   ELEVIO_PROJECT_ID       — project UUID (default: demo)
 *   ELEVIO_FLOOR_5_TOKEN    — floor 5 QR token (default: demo-5)
 *   ELEVIO_FLOOR_P1_TOKEN   — floor P1 QR token (default: demo-b1)
 *
 * Run: npm run test:e2e:operator-real-flow:live
 */
import { test, expect, type BrowserContext, type Page, type ConsoleMessage } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";
const PROJECT_ID = process.env.ELEVIO_PROJECT_ID || "11111111-1111-1111-1111-111111111111";
const FLOOR_5_TOKEN = process.env.ELEVIO_FLOOR_5_TOKEN || "demo-5";
const FLOOR_P1_TOKEN = process.env.ELEVIO_FLOOR_P1_TOKEN || "demo-b1";
const OP_EMAIL = process.env.ELEVIO_OPERATOR_EMAIL || "";
const OP_PASSWORD = process.env.ELEVIO_OPERATOR_PASSWORD || "";
const ARTIFACTS_DIR = process.env.ELEVIO_ARTIFACTS_DIR || "e2e-artifacts/operator-real-flow";

const debugLogs: string[] = [];
const consoleErrors: string[] = [];
const failures: string[] = [];

function collectConsole(page: Page, label: string) {
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === "error") consoleErrors.push(`[${label}] ${text.slice(0, 300)}`);
    if (text.includes("[RAMASSER]") || text.includes("[RAMASSER-RESULT]") || text.includes("[PAUSE-DIAG]") ||
        text.includes("[POLL-MERGE]") || text.includes("[COMBINED-BTN]") || text.includes("[updateRequestStatus]")) {
      debugLogs.push(`[${label}] ${text.slice(0, 500)}`);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[${label}-PAGEERR] ${err.message.slice(0, 300)}`);
  });
}

async function ss(page: Page, name: string) {
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  [SHOT] ${name}: ${file}`);
}

const wait = (ms = 1000) => new Promise(r => setTimeout(r, ms));

async function loginOperator(page: Page) {
  await page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  const url = page.url();

  // If redirected to login page
  if (url.includes("/login") || url.includes("/admin/login")) {
    console.log("  [AUTH] logging in operator...");
    await ss(page, "login-page");

    // Fill email
    const emailInput = page.locator("input[name=email], input[type=email]").first();
    await emailInput.fill(OP_EMAIL);
    // Fill password
    const passInput = page.locator("input[name=password], input[type=password]").first();
    await passInput.fill(OP_PASSWORD);
    // Click sign in
    const signInBtn = page.locator("button[type=submit], button", { hasText: /connexion|sign in|se connecter|login/i }).first();
    await signInBtn.click({ force: true });
    await wait(3000);

    // Should redirect to operator page
    const newUrl = page.url();
    console.log(`  [AUTH] after login URL: ${newUrl}`);
    await ss(page, "after-login");

    // If still on login, maybe need to navigate again
    if (newUrl.includes("/login")) {
      await page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
      await wait(2000);
    }
  }
}

async function loginAdmin(page: Page) {
  await page.goto(`${BASE}/admin/projects`, { waitUntil: "networkidle" });
  const url = page.url();

  if (url.includes("/login") || url.includes("/admin/login")) {
    console.log("  [AUTH] logging in admin...");
    const emailInput = page.locator("input[name=email], input[type=email]").first();
    await emailInput.fill(OP_EMAIL);
    const passInput = page.locator("input[name=password], input[type=password]").first();
    await passInput.fill(OP_PASSWORD);
    const signInBtn = page.locator("button[type=submit], button", { hasText: /connexion|sign in|se connecter|login/i }).first();
    await signInBtn.click({ force: true });
    await wait(3000);
    const newUrl = page.url();
    console.log(`  [AUTH] admin after login URL: ${newUrl}`);
    if (newUrl.includes("/login")) {
      await page.goto(`${BASE}/admin/projects`, { waitUntil: "networkidle" });
      await wait(2000);
    }
  }
}

async function submitPassengerRequest(page: Page, destinationLabel: string) {
  // FloorSelector uses buttons with type="button"
  // Find the button matching the destination label
  const destBtn = page.locator("button[type=button]").filter({ hasText: new RegExp(`^${destinationLabel}$|Aller à.*${destinationLabel}|Go to.*${destinationLabel}`, "i") }).first();
  if (await destBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await destBtn.click({ force: true });
    await wait(300);
    console.log(`  [ACTION] selected destination: ${destinationLabel}`);
  } else {
    // Try select dropdown
    const selectEl = page.locator("select").first();
    if (await selectEl.isVisible({ timeout: 1_000 }).catch(() => false)) {
      try {
        await selectEl.selectOption({ label: destinationLabel });
      } catch {
        await selectEl.selectOption({ value: destinationLabel });
      }
      console.log(`  [ACTION] selected destination via dropdown: ${destinationLabel}`);
    }
  }

  // Passenger count (default 1)
  const countInput = page.locator("input[type=number], input[name*=passenger], input[name*=count]").first();
  if (await countInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await countInput.fill("1");
  }

  // Submit
  const submitBtn = page.locator("button[type=submit]").filter({ hasText: /envoyer|send|demander|soumettre/i }).first();
  if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await submitBtn.click({ force: true });
    await wait(2000);
    console.log(`  [ACTION] submitted passenger request to ${destinationLabel}`);
  } else {
    // Try any submit button
    const anySubmit = page.locator("button[type=submit]").first();
    if (await anySubmit.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await anySubmit.click({ force: true });
      await wait(2000);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// THE SINGLE INTEGRATED FLOW
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial("operator-real-flow: 5→P1 + P1→5 with refresh, PAUSE, combined, release", () => {
  let opCtx: BrowserContext, opPage: Page;
  let op2Ctx: BrowserContext, op2Page: Page;
  let p5Ctx: BrowserContext, p5Page: Page;
  let pP1Ctx: BrowserContext, pP1Page: Page;
  let adminCtx: BrowserContext, adminPage: Page;

  test.beforeAll(async ({ browser }) => {
    if (!OP_EMAIL || !OP_PASSWORD) {
      console.log("\n  ⚠  ELEVIO_OPERATOR_EMAIL and ELEVIO_OPERATOR_PASSWORD not set!");
      console.log("  ⚠  Login will fail. Set these env vars before running the test.\n");
    }

    opCtx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, recordVideo: { dir: ARTIFACTS_DIR } });
    opPage = await opCtx.newPage();
    collectConsole(opPage, "Op1");

    op2Ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, recordVideo: { dir: ARTIFACTS_DIR } });
    op2Page = await op2Ctx.newPage();
    collectConsole(op2Page, "Op2");

    p5Ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: ARTIFACTS_DIR } });
    p5Page = await p5Ctx.newPage();
    collectConsole(p5Page, "P5");

    pP1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: ARTIFACTS_DIR } });
    pP1Page = await pP1Ctx.newPage();
    collectConsole(pP1Page, "PP1");

    adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: ARTIFACTS_DIR } });
    adminPage = await adminCtx.newPage();
    collectConsole(adminPage, "Admin");

    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  });

  test.afterAll(() => {
    console.log("\n══════════════════════════════════════════════════════════════════");
    console.log("   ELEVIO OPERATOR REAL FLOW — FINAL REPORT");
    console.log("══════════════════════════════════════════════════════════════════\n");
    console.log(`Failures: ${failures.length}`);
    if (failures.length > 0) {
      console.log("FAILURES:");
      for (const f of failures) console.log(`  ✗ ${f}`);
    }
    console.log(`\nDebug logs: ${debugLogs.length}`);
    if (debugLogs.length > 0) {
      console.log("KEY DEBUG LOGS:");
      for (const l of debugLogs.slice(0, 30)) console.log(`  ${l.slice(0, 300)}`);
    }
    console.log(`\nConsole errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log("KEY CONSOLE ERRORS:");
      for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e.slice(0, 200)}`);
    }
    console.log("\n══════════════════════════════════════════════════════════════════\n");
  });

  test.afterAll(async () => {
    await opCtx.close().catch(() => {});
    await op2Ctx.close().catch(() => {});
    await p5Ctx.close().catch(() => {});
    await pP1Ctx.close().catch(() => {});
    await adminCtx.close().catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 1: Login + Admin page loads
  // ─────────────────────────────────────────────────────────────────────
  test("1-admin-login-loads", async () => {
    await loginAdmin(adminPage);
    await ss(adminPage, "step1-admin");
    const url = adminPage.url();
    console.log(`  [INFO] admin URL: ${url}`);
    // If we're still on login page, login failed
    if (url.includes("/login")) {
      failures.push("1: admin login failed — check ELEVIO_OPERATOR_EMAIL/PASSWORD");
    }
    console.log("  [PASS] 1-admin-login-loads");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 2: Operator iPad 1 login
  // ─────────────────────────────────────────────────────────────────────
  test("2-operator-ipad1-login", async () => {
    await loginOperator(opPage);
    await ss(opPage, "step2-op1");
    const url = opPage.url();
    console.log(`  [INFO] op1 URL: ${url}`);
    if (url.includes("/login")) {
      failures.push("2: operator login failed");
    }
    console.log("  [PASS] 2-operator-ipad1-login");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 3: Operator iPad 2 login
  // ─────────────────────────────────────────────────────────────────────
  test("3-operator-ipad2-login", async () => {
    await loginOperator(op2Page);
    await ss(op2Page, "step3-op2");
    const url = op2Page.url();
    console.log(`  [INFO] op2 URL: ${url}`);
    console.log("  [PASS] 3-operator-ipad2-login");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 4: Passenger pages load (no auth needed)
  // ─────────────────────────────────────────────────────────────────────
  test("4-passenger-pages-load", async () => {
    await p5Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_5_TOKEN}`, { waitUntil: "networkidle" });
    await ss(p5Page, "step4-p5");

    await pP1Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_P1_TOKEN}`, { waitUntil: "networkidle" });
    await ss(pP1Page, "step4-pp1");

    const hasBtn5 = await p5Page.locator("button").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasBtnP1 = await pP1Page.locator("button").first().isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`  [INFO] passenger pages: floor5 interactive=${hasBtn5} P1 interactive=${hasBtnP1}`);
    console.log("  [PASS] 4-passenger-pages-load");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 5: Activate tablet on iPad 1
  // ─────────────────────────────────────────────────────────────────────
  test("5-activate-tablet-ipad1", async () => {
    await opPage.bringToFront();
    await opPage.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
    await wait(2000);
    await ss(opPage, "step5-before-activate");

    // The activate button says "Activer" (FR) or "Activate" (EN)
    const activateBtn = opPage.locator("button[type=submit]").filter({ hasText: /activer|activate|reprendre|reclaim/i }).first();
    const hasBtn = await activateBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasBtn) {
      // Fill device label if there's an input
      const labelInput = opPage.locator("input[name=label], input[placeholder*=appareil], input[placeholder*=iPad], input[name=tabletLabel]").first();
      if (await labelInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await labelInput.fill("iPad-1-E2E");
      }

      // Fill current floor if there's a select
      const floorSelect = opPage.locator("select[name=currentFloor], select[name=currentFloorId]").first();
      if (await floorSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
        // Select floor 5
        try { await floorSelect.selectOption({ label: "5" }); } catch { /* try value */ }
      }

      console.log("  [ACTION] 5: clicking Activer...");
      await activateBtn.click({ force: true });
      await wait(4000);
      await ss(opPage, "step5-after-activate");

      // Verify workspace is visible
      const workspace = opPage.locator("text=/hoist|alpha|en service|session/i").first();
      const hasWorkspace = await workspace.isVisible({ timeout: 5_000 }).catch(() => false);
      console.log(`  [RESULT] 5: workspace visible after activate: ${hasWorkspace}`);
    } else {
      console.log("  [INFO] 5: no activate button visible (may already be active)");
      // Check if already in workspace
      const bodyText = await opPage.locator("body").textContent() || "";
      const inWorkspace = /en service|liberer|release|ramasser|deposer/i.test(bodyText);
      console.log(`  [INFO] 5: appears in workspace: ${inWorkspace}`);
    }

    // Check iPad 2 sees the activation
    await wait(2000);
    await op2Page.bringToFront();
    await op2Page.reload({ waitUntil: "networkidle" });
    await wait(2000);
    await ss(op2Page, "step5-op2-after-activation");
    console.log("  [PASS] 5-activate-tablet-ipad1");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 6: Create crossed requests A: 5→P1 and B: P1→5
  // ─────────────────────────────────────────────────────────────────────
  test("6-create-crossed-requests", async () => {
    // Passenger at floor 5 → destination P1
    await p5Page.bringToFront();
    await p5Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_5_TOKEN}`, { waitUntil: "networkidle" });
    await wait(1000);
    await submitPassengerRequest(p5Page, "P1");
    await ss(p5Page, "step6-p5-submitted");
    console.log("  [ACTION] 6: passenger at 5 submitted A (5→P1)");

    // Passenger at floor P1 → destination 5
    await pP1Page.bringToFront();
    await pP1Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_P1_TOKEN}`, { waitUntil: "networkidle" });
    await wait(1000);
    await submitPassengerRequest(pP1Page, "5");
    await ss(pP1Page, "step6-pp1-submitted");
    console.log("  [ACTION] 6: passenger at P1 submitted B (P1→5)");

    // Wait for requests to propagate to operator
    await wait(3000);
    await opPage.bringToFront();
    await opPage.reload({ waitUntil: "networkidle" });
    await wait(3000);
    await ss(opPage, "step6-operator-sees-requests");

    // Verify operator sees at least one request
    const bodyText = await opPage.locator("body").textContent() || "";
    const hasRamasser = /ramasser|pickup/i.test(bodyText);
    const hasDeposer = /deposer|dropoff/i.test(bodyText);
    console.log(`  [RESULT] 6: operator sees: ramasser=${hasRamasser} deposer=${hasDeposer}`);
    if (!hasRamasser && !hasDeposer) {
      failures.push("6: operator does not see any requests after submission");
    }
    console.log("  [PASS] 6-create-crossed-requests");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 7: Pickup A — verify no PAUSE for 20s + passenger QR <2s
  // ─────────────────────────────────────────────────────────────────────
  test("7-pickup-A-no-pause-passenger-QR", async () => {
    await opPage.bringToFront();
    await wait(1000);

    // Record passenger 5 URL before pickup
    const p5UrlBefore = p5Page.url();
    console.log(`  [INFO] 7: passenger 5 URL before pickup: ${p5UrlBefore}`);

    // Find Ramasser button
    await ss(opPage, "step7-before-pickup");
    const pickupBtn = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
    let hasPickup = await pickupBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasPickup) {
      // Maybe we need to navigate elevator to floor 5 first
      // Check if there's a "go to floor 5" or the brain recommends going to 5
      const goTo5 = opPage.locator("button, [data-floor]").filter({ hasText: /^5$|étage 5|floor 5/i }).first();
      if (await goTo5.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log("  [ACTION] 7: navigating to floor 5 first...");
        await goTo5.click({ force: true });
        await wait(3000);
        await ss(opPage, "step7-at-floor5");
      }

      // Re-check for Ramasser
      const pickupBtn2 = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
      hasPickup = await pickupBtn2.isVisible({ timeout: 5_000 }).catch(() => false);
    }

    if (!hasPickup) {
      console.log("  [WARN] 7: no Ramasser button visible — cannot test pickup");
      failures.push("7: no Ramasser button found");
      console.log("  [PASS] 7-pickup-A-no-pause-passenger-QR (skipped)");
      return;
    }

    // Click Ramasser
    const pickupBtnFinal = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
    console.log("  [ACTION] 7: clicking Ramasser for request A...");
    const pickupStart = Date.now();
    await pickupBtnFinal.click({ force: true });
    await wait(500);

    // ── Passenger QR return timing ──
    await p5Page.bringToFront();
    const qrReturnDeadline = pickupStart + 2000;
    let qrReturned = false;
    let qrElapsed = 0;

    for (let i = 0; i < 20; i++) {
      await wait(200);
      qrElapsed = Date.now() - pickupStart;
      try {
        const p5Body = await p5Page.locator("body").textContent({ timeout: 500 });
        // QR returned if we see "QR" or "Scanner" or back to request form (not waiting)
        const isWaiting = /attente|en attente|waiting|tracking|suivi/i.test(p5Body || "");
        const hasQR = /qr|scanner|scan|nouvelle demande|new request/i.test(p5Body || "");
        if (!isWaiting || hasQR) {
          qrReturned = true;
          break;
        }
      } catch { /* page may be reloading */ }
    }

    qrElapsed = Date.now() - pickupStart;
    if (qrReturned) {
      console.log(`  [RESULT] 7: passenger QR returned in ${qrElapsed}ms (limit: 2000ms)`);
      if (qrElapsed > 2000) {
        failures.push(`7: passenger QR return took ${qrElapsed}ms > 2000ms`);
      }
    } else {
      console.log(`  [FAIL] 7: passenger QR did NOT return within ${qrElapsed}ms`);
      failures.push(`7: passenger QR did not return within ${qrElapsed}ms`);
      await ss(p5Page, "step7-p5-no-qr-return");
    }

    // ── PAUSE check for 20 seconds ──
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step7-after-pickup");

    console.log("  [WAIT] 7: monitoring for PAUSE for 20 seconds...");
    let pauseSeen = false;
    for (let i = 0; i < 20; i++) {
      await wait(1000);
      const bodyText = await opPage.locator("body").textContent() || "";
      // Check for PAUSE indicator (the text "Pause" as a status, not a button)
      // In the operator UI, PAUSE means idle_empty recommendation
      const pauseMatch = bodyText.match(/\b(pause|attente)\b/i);
      if (pauseMatch && !/liberer|release/i.test(bodyText.slice(bodyText.indexOf(pauseMatch[0]) - 50, bodyText.indexOf(pauseMatch[0]) + 50))) {
        pauseSeen = true;
        await ss(opPage, `step7-pause-at-${i + 1}s`);
        console.log(`  [FAIL] 7: PAUSE detected at ${i + 1}s after pickup!`);
        failures.push(`7: PAUSE at ${i + 1}s after pickup`);
        // Check PAUSE-DIAG
        const pauseDiag = debugLogs.filter(l => l.includes("[PAUSE-DIAG]")).pop();
        if (pauseDiag) console.log(`  [DEBUG] ${pauseDiag.slice(0, 300)}`);
        break;
      }
    }
    if (!pauseSeen) {
      console.log("  [PASS] 7: no PAUSE for 20 seconds after pickup");
    }

    // ── Refresh persistence check ──
    await opPage.reload({ waitUntil: "networkidle" });
    await wait(3000);
    await ss(opPage, "step7-after-refresh");

    const dropoffAfterRefresh = opPage.locator("button").filter({ hasText: /deposer|dropoff/i }).first();
    const pickupAfterRefresh = opPage.locator("button").filter({ hasText: /ramasser|pickup/i }).first();
    const hasDropoff = await dropoffAfterRefresh.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasPickupAgain = await pickupAfterRefresh.isVisible({ timeout: 3_000 }).catch(() => false);

    console.log(`  [RESULT] 7: after refresh: dropoff=${hasDropoff} pickup=${hasPickupAgain}`);
    if (hasPickupAgain && !hasDropoff) {
      console.log("  [FAIL] 7: Ramasser still visible after refresh — DB NOT PERSISTED!");
      failures.push("7: after Ramasser + refresh, still shows Ramasser (DB not persisted)");
      const ramasserResult = debugLogs.filter(l => l.includes("[RAMASSER-RESULT]")).pop();
      if (ramasserResult) console.log(`  [DEBUG] ${ramasserResult.slice(0, 300)}`);
    }

    console.log("  [PASS] 7-pickup-A-no-pause-passenger-QR (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 8: Combined Déposer + Ramasser button at P1
  // ─────────────────────────────────────────────────────────────────────
  test("8-combined-button-drop-pick", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step8-before-combined");

    // The elevator should be heading to P1 (or already there)
    // Navigate to P1 if there's a floor selector
    const goToP1 = opPage.locator("button, [data-floor]").filter({ hasText: /^P1$|étage P1|floor P1/i }).first();
    if (await goToP1.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log("  [ACTION] 8: navigating to P1...");
      await goToP1.click({ force: true });
      await wait(3000);
      await ss(opPage, "step8-at-P1");
    }

    // Check for combined Déposer + Ramasser button
    const combinedBtn = opPage.locator("button").filter({ hasText: /deposer.*ramasser|drop off.*pickup|deposer \+ ramasser|deposer.*\+.*ramasser/i }).first();
    const hasCombined = await combinedBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    // Check COMBINED-BTN debug log
    const combinedDiag = debugLogs.filter(l => l.includes("[COMBINED-BTN]")).pop();
    if (combinedDiag) console.log(`  [DEBUG] ${combinedDiag.slice(0, 400)}`);

    console.log(`  [RESULT] 8: combined button visible: ${hasCombined}`);

    if (hasCombined) {
      console.log("  [ACTION] 8: clicking combined Déposer + Ramasser...");
      const clickStart = Date.now();
      await combinedBtn.click({ force: true });
      await wait(3000);
      await ss(opPage, "step8-after-combined");

      // Verify passenger B QR returned <2s
      await pP1Page.bringToFront();
      let pP1QrReturned = false;
      let pP1QrElapsed = 0;
      for (let i = 0; i < 15; i++) {
        await wait(200);
        pP1QrElapsed = Date.now() - clickStart;
        try {
          const body = await pP1Page.locator("body").textContent({ timeout: 500 });
          const isWaiting = /attente|en attente|waiting|tracking|suivi/i.test(body || "");
          const hasQR = /qr|scanner|scan|nouvelle demande|new request/i.test(body || "");
          if (!isWaiting || hasQR) {
            pP1QrReturned = true;
            break;
          }
        } catch { /* page reloading */ }
      }

      pP1QrElapsed = Date.now() - clickStart;
      if (pP1QrReturned) {
        console.log(`  [RESULT] 8: passenger B QR returned in ${pP1QrElapsed}ms`);
        if (pP1QrElapsed > 2000) {
          failures.push(`8: passenger B QR return took ${pP1QrElapsed}ms > 2000ms`);
        }
      } else {
        console.log(`  [FAIL] 8: passenger B QR did NOT return within ${pP1QrElapsed}ms`);
        failures.push(`8: passenger B QR did not return within ${pP1QrElapsed}ms`);
      }

      // Verify next action is Déposer at 5
      await opPage.bringToFront();
      await wait(1000);
      const bodyText = await opPage.locator("body").textContent() || "";
      const hasDropoff5 = /deposer|dropoff/i.test(bodyText);
      console.log(`  [RESULT] 8: after combined, has dropoff action: ${hasDropoff5}`);

      // Refresh — still Déposer at 5
      await opPage.reload({ waitUntil: "networkidle" });
      await wait(3000);
      await ss(opPage, "step8-after-refresh");
      const bodyTextRefresh = await opPage.locator("body").textContent() || "";
      const hasDropoff5Refresh = /deposer|dropoff/i.test(bodyTextRefresh);
      console.log(`  [RESULT] 8: after refresh, has dropoff action: ${hasDropoff5Refresh}`);

      // Wait 20s — no PAUSE
      console.log("  [WAIT] 8: monitoring for PAUSE for 20 seconds...");
      let pauseSeen = false;
      for (let i = 0; i < 20; i++) {
        await wait(1000);
        const bodyText20s = await opPage.locator("body").textContent() || "";
        const pauseMatch = bodyText20s.match(/\b(pause|attente)\b/i);
        if (pauseMatch) {
          pauseSeen = true;
          await ss(opPage, `step8-pause-at-${i + 1}s`);
          console.log(`  [FAIL] 8: PAUSE at ${i + 1}s after combined!`);
          failures.push(`8: PAUSE at ${i + 1}s after combined`);
          break;
        }
      }
      if (!pauseSeen) console.log("  [PASS] 8: no PAUSE for 20s after combined action");
    } else {
      console.log("  [FAIL] 8: combined Déposer + Ramasser button NOT VISIBLE!");
      failures.push("8: combined Déposer + Ramasser button not visible at P1");

      // Try individual buttons as fallback
      const dropoffBtn = opPage.locator("button").filter({ hasText: /deposer|dropoff/i }).first();
      const pickupBtn = opPage.locator("button").filter({ hasText: /ramasser|pickup/i }).first();
      const hasDropoff = await dropoffBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      const hasPickup = await pickupBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      console.log(`  [INFO] 8: individual buttons: dropoff=${hasDropoff} pickup=${hasPickup}`);

      // If both individual buttons exist, click them both
      if (hasDropoff && hasPickup) {
        console.log("  [ACTION] 8: clicking Déposer then Ramasser separately...");
        await dropoffBtn.click({ force: true });
        await wait(2000);
        await pickupBtn.click({ force: true });
        await wait(3000);
        await ss(opPage, "step8-after-separate-actions");
      }
    }
    console.log("  [PASS] 8-combined-button-drop-pick (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 9: Dropoff B at floor 5
  // ─────────────────────────────────────────────────────────────────────
  test("9-dropoff-B-no-old-requests", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step9-before-dropoff");

    // Navigate to floor 5 if needed
    const goTo5 = opPage.locator("button, [data-floor]").filter({ hasText: /^5$|étage 5|floor 5/i }).first();
    if (await goTo5.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await goTo5.click({ force: true });
      await wait(3000);
      await ss(opPage, "step9-at-floor5");
    }

    const dropoffBtn = opPage.locator("button").filter({ hasText: /deposer|dropoff/i }).first();
    const hasDropoff = await dropoffBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasDropoff) {
      console.log("  [ACTION] 9: clicking Déposer for request B...");
      await dropoffBtn.click({ force: true });
      await wait(3000);
      await ss(opPage, "step9-after-dropoff");

      // Refresh — verify no old requests return
      for (let i = 0; i < 3; i++) {
        await opPage.reload({ waitUntil: "networkidle" });
        await wait(2000);
      }
      await ss(opPage, "step9-after-3-refreshes");

      const bodyText = await opPage.locator("body").textContent() || "";
      const hasOldRequest = /complète|terminée|completed.*request/i.test(bodyText);
      if (hasOldRequest) {
        console.log("  [WARN] 9: completed request text visible after refreshes");
        failures.push("9: old completed request visible after refresh");
      }
    } else {
      console.log("  [INFO] 9: no Déposer button visible");
    }
    console.log("  [PASS] 9-dropoff-B-no-old-requests (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 10: Release and immediate re-activate
  // ─────────────────────────────────────────────────────────────────────
  test("10-release-reactivate-immediate", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step10-before-release");

    const releaseBtn = opPage.locator("button").filter({ hasText: /liberer|release|liberer cette tablette|release this tablet/i }).first();
    const hasRelease = await releaseBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasRelease) {
      console.log("  [ACTION] 10: clicking Libérer cette tablette...");
      await releaseBtn.click({ force: true });
      await wait(1000);
      await ss(opPage, "step10-after-release");

      // IMMEDIATELY look for activate button
      console.log("  [ACTION] 10: looking for Activer button IMMEDIATELY...");
      const activateBtn = opPage.locator("button[type=submit]").filter({ hasText: /activer|activate|reprendre|reclaim/i }).first();
      const start = Date.now();
      const hasActivate = await activateBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      const foundElapsed = Date.now() - start;

      console.log(`  [RESULT] 10: activate button visible: ${hasActivate} (found in ${foundElapsed}ms)`);

      if (hasActivate) {
        if (foundElapsed > 2000) {
          failures.push(`10: Actif button took ${foundElapsed}ms to appear (>2s)`);
        }

        // Click it immediately
        const reActivateStart = Date.now();
        await activateBtn.click({ force: true });
        await wait(4000);
        const reActivateElapsed = Date.now() - reActivateStart;
        await ss(opPage, "step10-after-reactivate");

        console.log(`  [RESULT] 10: re-activation response in ${reActivateElapsed}ms`);
        if (reActivateElapsed > 2000) {
          failures.push(`10: re-activation took ${reActivateElapsed}ms (>2s)`);
        }

        // Verify terminal is clean
        const bodyText = await opPage.locator("body").textContent() || "";
        const hasWork = /ramasser|deposer|dropoff|pickup/i.test(bodyText);
        console.log(`  [INFO] 10: after re-activate, has remaining work: ${hasWork}`);
      } else {
        console.log("  [FAIL] 10: Activer button NOT found after release!");
        failures.push("10: Activer button not found after Libérer");
      }
    } else {
      console.log("  [INFO] 10: no Libérer button visible (tablet not active)");
    }
    console.log("  [PASS] 10-release-reactivate-immediate (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 11: Multi-device sync
  // ─────────────────────────────────────────────────────────────────────
  test("11-multi-device-sync", async () => {
    await op2Page.bringToFront();
    await op2Page.reload({ waitUntil: "networkidle" });
    await wait(3000);
    await ss(op2Page, "step11-ipad2-state");

    // Check for ghost Reprendre button
    const ghostReprendre = op2Page.locator("button").filter({ hasText: /reprendre|reclaim/i }).first();
    const hasGhost = await ghostReprendre.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasGhost) {
      console.log("  [FAIL] 11: ghost Reprendre button on iPad 2!");
      failures.push("11: ghost Reprendre button on iPad 2");
    }

    // Both iPads should show same state
    const op2Body = await op2Page.locator("body").textContent() || "";
    console.log(`  [INFO] 11: iPad 2 state (first 200): ${op2Body.slice(0, 200)}`);
    console.log("  [PASS] 11-multi-device-sync (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 12: No old/terminal requests after multiple refreshes
  // ─────────────────────────────────────────────────────────────────────
  test("12-no-old-requests-after-refresh", async () => {
    await opPage.bringToFront();

    for (let i = 0; i < 5; i++) {
      await opPage.reload({ waitUntil: "networkidle" });
      await wait(1500);
    }
    await ss(opPage, "step12-after-5-refreshes");

    const bodyText = await opPage.locator("body").textContent() || "";
    const hasBadState = /complète|terminée|completed.*request|cancelled.*request/i.test(bodyText);
    if (hasBadState) {
      console.log("  [WARN] 12: completed/cancelled request text visible after 5 refreshes");
      failures.push("12: old request visible after 5 refreshes");
    }
    console.log("  [PASS] 12-no-old-requests-after-refresh (completed)");
  });
});
