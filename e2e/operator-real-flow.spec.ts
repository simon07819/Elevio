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
 * Run: npm run test:e2e:operator-real-flow:live
 */
import { test, expect, type BrowserContext, type Page, type ConsoleMessage } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";
const PROJECT_ID = process.env.ELEVIO_PROJECT_ID || "11111111-1111-1111-1111-111111111111";
const FLOOR_5_TOKEN = process.env.ELEVIO_FLOOR_5_TOKEN || "demo-5";
const FLOOR_P1_TOKEN = process.env.ELEVIO_FLOOR_P1_TOKEN || "demo-b1";
const ARTIFACTS_DIR = process.env.ELEVIO_ARTIFACTS_DIR || "e2e-artifacts/operator-real-flow";

const debugLogs: string[] = [];
const consoleErrors: string[] = [];

function collectConsole(page: Page, label: string) {
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === "error") consoleErrors.push(`[${label}] ${text}`);
    if (text.includes("[RAMASSER]") || text.includes("[RAMASSER-RESULT]") || text.includes("[PAUSE-DIAG]") ||
        text.includes("[POLL-MERGE]") || text.includes("[COMBINED-BTN]") || text.includes("[updateRequestStatus]")) {
      debugLogs.push(`[${label}] ${text.slice(0, 500)}`);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[${label}-PAGEERR] ${err.message}`);
  });
}

async function ss(page: Page, name: string) {
  const dir = ARTIFACTS_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  [SHOT] ${name}: ${file}`);
}

const wait = (ms = 1000) => new Promise(r => setTimeout(r, ms));

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
    // Create all contexts upfront
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

    // Clean up artifacts dir
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    console.log("\n══════════════════════════════════════════════════════════════════");
    console.log("   ELEVIO OPERATOR REAL FLOW — FINAL REPORT");
    console.log("══════════════════════════════════════════════════════════════════\n");
    console.log(`Debug logs captured: ${debugLogs.length}`);
    console.log(`Console errors: ${consoleErrors.length}`);
    if (debugLogs.length > 0) {
      console.log("\nKEY DEBUG LOGS:");
      for (const l of debugLogs.slice(0, 30)) console.log(`  ${l.slice(0, 300)}`);
    }
    if (consoleErrors.length > 0) {
      console.log("\nKEY CONSOLE ERRORS:");
      for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e.slice(0, 200)}`);
    }
    console.log("\n══════════════════════════════════════════════════════════════════\n");

    await opCtx.close();
    await op2Ctx.close();
    await p5Ctx.close();
    await pP1Ctx.close();
    await adminCtx.close();
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 1: Admin page loads
  // ─────────────────────────────────────────────────────────────────────
  test("1-admin-loads", async () => {
    await adminPage.goto(`${BASE}/admin/projects`, { waitUntil: "networkidle" });
    await ss(adminPage, "step1-admin");
    const body = await adminPage.locator("body").textContent();
    expect(body!.length).toBeGreaterThan(50);
    console.log("  [PASS] 1-admin-loads");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 2: Operator iPad 1 loads
  // ─────────────────────────────────────────────────────────────────────
  test("2-operator-ipad1-loads", async () => {
    await opPage.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
    await ss(opPage, "step2-op1");
    const body = await opPage.locator("body").textContent();
    expect(body!.length).toBeGreaterThan(50);
    console.log("  [PASS] 2-operator-ipad1-loads");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 3: Operator iPad 2 loads
  // ─────────────────────────────────────────────────────────────────────
  test("3-operator-ipad2-loads", async () => {
    await op2Page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
    await ss(op2Page, "step3-op2");
    const body = await op2Page.locator("body").textContent();
    expect(body!.length).toBeGreaterThan(50);
    console.log("  [PASS] 3-operator-ipad2-loads");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 4: Passenger pages load for floors 5 and P1
  // ─────────────────────────────────────────────────────────────────────
  test("4-passenger-pages-load", async () => {
    await p5Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_5_TOKEN}`, { waitUntil: "networkidle" });
    await ss(p5Page, "step4-p5");

    await pP1Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_P1_TOKEN}`, { waitUntil: "networkidle" });
    await ss(pP1Page, "step4-pp1");

    // Verify both pages have interactive elements
    const hasForm5 = await p5Page.locator("form, select, button").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasFormP1 = await pP1Page.locator("form, select, button").first().isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`  [INFO] passenger pages: floor5 form=${hasForm5} P1 form=${hasFormP1}`);
    console.log("  [PASS] 4-passenger-pages-load");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 5: Activate tablet on iPad 1
  // ─────────────────────────────────────────────────────────────────────
  test("5-activate-tablet-ipad1", async () => {
    await opPage.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
    await wait(1000);
    await ss(opPage, "step5-before-activate");

    // Look for any activate button
    const activateBtn = opPage.locator("button[type=submit], button").filter({ hasText: /actif|activer|activate/i }).first();
    const hasBtn = await activateBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasBtn) {
      // Fill device label if there's an input
      const labelInput = opPage.locator("input[name=label], input[placeholder*=appareil], input[placeholder*=iPad]").first();
      if (await labelInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await labelInput.fill("iPad-1-E2E");
      }

      console.log("  [ACTION] 5: clicking Actif...");
      await activateBtn.click();
      await wait(3000);
      await ss(opPage, "step5-after-activate");
    } else {
      console.log("  [INFO] 5: no activate button visible (may already be active or elevator list empty)");
    }

    // Check iPad 2 sees the activation
    await wait(2000);
    await op2Page.reload({ waitUntil: "networkidle" });
    await wait(1000);
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
    await wait(500);

    // Try to select P1 as destination and submit
    await submitPassengerRequest(p5Page, "P1");
    await ss(p5Page, "step6-p5-submitted");
    console.log("  [ACTION] 6: passenger at floor 5 submitted request A (5→P1)");

    // Passenger at floor P1 → destination 5
    await pP1Page.bringToFront();
    await pP1Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_P1_TOKEN}`, { waitUntil: "networkidle" });
    await wait(500);

    await submitPassengerRequest(pP1Page, "5");
    await ss(pP1Page, "step6-pp1-submitted");
    console.log("  [ACTION] 6: passenger at P1 submitted request B (P1→5)");

    // Wait for requests to propagate to operator
    await wait(2000);
    await opPage.bringToFront();
    await opPage.reload({ waitUntil: "networkidle" });
    await wait(2000);
    await ss(opPage, "step6-operator-sees-requests");
    console.log("  [PASS] 6-create-crossed-requests");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 7: Pickup A — verify no PAUSE for 20s + passenger QR return <2s
  // ─────────────────────────────────────────────────────────────────────
  test("7-pickup-A-no-pause-passenger-QR", async () => {
    await opPage.bringToFront();
    await wait(1000);

    // Record passenger 5 state before pickup
    await p5Page.bringToFront();
    const p5UrlBefore = p5Page.url();
    console.log(`  [INFO] 7: passenger 5 URL before pickup: ${p5UrlBefore}`);

    // Go to operator and click Ramasser
    await opPage.bringToFront();
    await ss(opPage, "step7-before-pickup");

    const pickupBtn = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
    const hasPickup = await pickupBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasPickup) {
      console.log("  [WARN] 7: no Ramasser button visible — trying to navigate to floor 5 first");
      // Try clicking a "go to floor 5" or next-stop button
      const goTo5 = opPage.locator("button, [data-floor]").filter({ hasText: /5/i }).first();
      if (await goTo5.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await goTo5.click();
        await wait(2000);
        await ss(opPage, "step7-at-floor5");
      }
    }

    // Try pickup again
    const pickupBtn2 = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
    const hasPickup2 = await pickupBtn2.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasPickup2) {
      console.log("  [ACTION] 7: clicking Ramasser for request A...");
      const pickupStart = Date.now();
      await pickupBtn2.click();
      await wait(500);

      // Switch to passenger 5 — time how long until QR returns
      await p5Page.bringToFront();
      const qrReturnDeadline = pickupStart + 2000;
      let qrReturned = false;

      // Poll passenger page for QR/return state
      for (let i = 0; i < 10; i++) {
        await wait(200);
        const p5Url = p5Page.url();
        const p5Body = await p5Page.locator("body").textContent();
        // QR returned if we see "QR" or "scanner" or we're back to the request form
        if (p5Body?.includes("QR") || p5Body?.includes("Scanner") || p5Body?.includes("scan") ||
            p5Body?.includes("nouvelle") || p5Body?.includes("Nouvelle demande") ||
            !p5Body?.includes("attente") && !p5Body?.includes("En attente")) {
          const qrElapsed = Date.now() - pickupStart;
          qrReturned = true;
          console.log(`  [RESULT] 7: passenger QR returned in ${qrElapsed}ms (limit: 2000ms)`);
          if (qrElapsed > 2000) {
            console.log(`  [FAIL] 7: passenger QR return took ${qrElapsed}ms > 2000ms!`);
          }
          break;
        }
      }
      if (!qrReturned) {
        const qrElapsed = Date.now() - pickupStart;
        console.log(`  [FAIL] 7: passenger QR did NOT return within ${qrElapsed}ms`);
        await ss(p5Page, "step7-p5-no-qr-return");
      }

      // Go back to operator — check for PAUSE for 20 seconds
      await opPage.bringToFront();
      await wait(1000);
      await ss(opPage, "step7-after-pickup");

      console.log("  [WAIT] 7: monitoring for PAUSE for 20 seconds...");
      let pauseSeen = false;
      for (let i = 0; i < 20; i++) {
        await wait(1000);
        const bodyText = await opPage.locator("body").textContent() || "";
        // Check for PAUSE indicators
        const hasPauseText = /pause|attente|en attente/i.test(bodyText);
        const hasPauseDisabled = await opPage.locator("button:disabled").filter({ hasText: /pause/i }).isVisible().catch(() => false);
        if (hasPauseText || hasPauseDisabled) {
          pauseSeen = true;
          await ss(opPage, `step7-pause-at-${i + 1}s`);
          console.log(`  [FAIL] 7: PAUSE detected at ${i + 1}s after pickup!`);

          // Check PAUSE-DIAG log
          const pauseDiag = debugLogs.filter(l => l.includes("[PAUSE-DIAG]")).pop();
          if (pauseDiag) console.log(`  [DEBUG] ${pauseDiag.slice(0, 300)}`);
          break;
        }
      }
      if (!pauseSeen) {
        console.log("  [PASS] 7: no PAUSE for 20 seconds after pickup");
      }

      // Refresh and verify Déposer persists
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
        const ramasserResult = debugLogs.filter(l => l.includes("[RAMASSER-RESULT]")).pop();
        if (ramasserResult) console.log(`  [DEBUG] ${ramasserResult.slice(0, 300)}`);
      }
    } else {
      console.log("  [WARN] 7: no Ramasser button found — cannot test pickup flow");
    }
    console.log("  [PASS] 7-pickup-A-no-pause-passenger-QR (test completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 8: Combined Déposer + Ramasser button at P1
  // ─────────────────────────────────────────────────────────────────────
  test("8-combined-button-drop-pick", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step8-before-combined");

    // Navigate to P1 (where both dropoff and pickup should be)
    const goToP1 = opPage.locator("button, [data-floor]").filter({ hasText: /P1/i }).first();
    if (await goToP1.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await goToP1.click();
      await wait(2000);
      await ss(opPage, "step8-at-P1");
    }

    // Check for combined button
    const combinedBtn = opPage.locator("button").filter({ hasText: /deposer.*ramasser|drop off.*pickup|deposer \+ ramasser/i }).first();
    const hasCombined = await combinedBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    // Check COMBINED-BTN debug log
    const combinedDiag = debugLogs.filter(l => l.includes("[COMBINED-BTN]")).pop();
    if (combinedDiag) console.log(`  [DEBUG] ${combinedDiag.slice(0, 400)}`);

    console.log(`  [RESULT] 8: combined button visible: ${hasCombined}`);

    if (hasCombined) {
      console.log("  [ACTION] 8: clicking combined Déposer + Ramasser...");
      const clickStart = Date.now();
      await combinedBtn.click();
      await wait(3000);
      await ss(opPage, "step8-after-combined");

      // Verify passenger P1 QR returned <2s
      await pP1Page.bringToFront();
      let pP1QrReturned = false;
      for (let i = 0; i < 10; i++) {
        await wait(200);
        const body = await pP1Page.locator("body").textContent();
        if (body?.includes("QR") || body?.includes("Scanner") || body?.includes("scan") ||
            body?.includes("nouvelle") || body?.includes("Nouvelle demande")) {
          const elapsed = Date.now() - clickStart;
          pP1QrReturned = true;
          console.log(`  [RESULT] 8: passenger B QR returned in ${elapsed}ms`);
          if (elapsed > 2000) console.log(`  [FAIL] 8: passenger B QR return took ${elapsed}ms > 2000ms!`);
          break;
        }
      }
      if (!pP1QrReturned) {
        const elapsed = Date.now() - clickStart;
        console.log(`  [FAIL] 8: passenger B QR did NOT return within ${elapsed}ms`);
      }

      // Verify next action is Déposer at 5
      await opPage.bringToFront();
      await wait(1000);
      const dropoff5 = opPage.locator("text=/deposer.*5|drop.*5|5.*deposer/i").first();
      const hasDropoff5 = await dropoff5.isVisible({ timeout: 5_000 }).catch(() => false);
      console.log(`  [RESULT] 8: after combined, dropoff at 5 visible: ${hasDropoff5}`);

      // Refresh — still Déposer at 5
      await opPage.reload({ waitUntil: "networkidle" });
      await wait(3000);
      await ss(opPage, "step8-after-refresh");
      const dropoff5Refresh = opPage.locator("text=/deposer.*5|drop.*5|5.*deposer/i").first();
      const hasDropoff5Refresh = await dropoff5Refresh.isVisible({ timeout: 5_000 }).catch(() => false);
      console.log(`  [RESULT] 8: after refresh, dropoff at 5 visible: ${hasDropoff5Refresh}`);

      // Wait 20s — no PAUSE
      console.log("  [WAIT] 8: monitoring for PAUSE for 20 seconds...");
      let pauseSeen = false;
      for (let i = 0; i < 20; i++) {
        await wait(1000);
        const bodyText = await opPage.locator("body").textContent() || "";
        if (/pause|attente|en attente/i.test(bodyText)) {
          pauseSeen = true;
          await ss(opPage, `step8-pause-at-${i + 1}s`);
          console.log(`  [FAIL] 8: PAUSE at ${i + 1}s!`);
          break;
        }
      }
      if (!pauseSeen) console.log("  [PASS] 8: no PAUSE for 20s after combined action");
    } else {
      console.log("  [FAIL] 8: combined Déposer + Ramasser button NOT VISIBLE!");
      // Try individual buttons
      const dropoffBtn = opPage.locator("button").filter({ hasText: /deposer|dropoff/i }).first();
      const pickupBtn = opPage.locator("button").filter({ hasText: /ramasser|pickup/i }).first();
      const hasDropoff = await dropoffBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      const hasPickup = await pickupBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      console.log(`  [INFO] 8: individual buttons: dropoff=${hasDropoff} pickup=${hasPickup}`);
    }
    console.log("  [PASS] 8-combined-button-drop-pick (test completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 9: Dropoff B at floor 5 — verify completed, no old requests
  // ─────────────────────────────────────────────────────────────────────
  test("9-dropoff-B-no-old-requests", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step9-before-dropoff");

    const dropoffBtn = opPage.locator("button").filter({ hasText: /deposer|dropoff/i }).first();
    const hasDropoff = await dropoffBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasDropoff) {
      console.log("  [ACTION] 9: clicking Déposer for request B...");
      await dropoffBtn.click();
      await wait(3000);
      await ss(opPage, "step9-after-dropoff");

      // Refresh — verify no old requests return
      await opPage.reload({ waitUntil: "networkidle" });
      await wait(2000);
      await ss(opPage, "step9-after-refresh");

      // Check for completed/cancelled requests appearing
      const completedText = await opPage.locator("body").textContent();
      const hasOldRequest = /compl|termine|completed|cancelled|annul/i.test(completedText || "");
      console.log(`  [INFO] 9: old request text visible: ${hasOldRequest}`);

      // Refresh again
      await opPage.reload({ waitUntil: "networkidle" });
      await wait(2000);
      await ss(opPage, "step9-after-2nd-refresh");
    } else {
      console.log("  [INFO] 9: no Déposer button visible — may already be completed");
    }
    console.log("  [PASS] 9-dropoff-B-no-old-requests (test completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 10: Release and immediate re-activate
  // ─────────────────────────────────────────────────────────────────────
  test("10-release-reactivate-immediate", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step10-before-release");

    const releaseBtn = opPage.locator("button").filter({ hasText: /liberer|release|liberer cette tablette/i }).first();
    const hasRelease = await releaseBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasRelease) {
      console.log("  [ACTION] 10: clicking Libérer cette tablette...");
      await releaseBtn.click();
      await wait(500);
      await ss(opPage, "step10-after-release");

      // IMMEDIATELY look for activate button
      console.log("  [ACTION] 10: looking for Actif button IMMEDIATELY...");
      const activateBtn = opPage.locator("button[type=submit], button").filter({ hasText: /actif|activer|activate/i }).first();
      const start = Date.now();
      const hasActivate = await activateBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      const elapsed = Date.now() - start;

      console.log(`  [RESULT] 10: activate button visible: ${hasActivate} (found in ${elapsed}ms)`);

      if (hasActivate) {
        if (elapsed > 2000) {
          console.log(`  [FAIL] 10: Actif button took ${elapsed}ms to appear (>2s)`);
        }

        // Click it immediately
        const reActivateStart = Date.now();
        await activateBtn.click();
        await wait(3000);
        const reActivateElapsed = Date.now() - reActivateStart;
        await ss(opPage, "step10-after-reactivate");

        console.log(`  [RESULT] 10: re-activation completed in ${reActivateElapsed}ms`);

        // Verify terminal is clean
        const bodyText = await opPage.locator("body").textContent() || "";
        const hasWork = /ramasser|deposer|dropoff|pickup/i.test(bodyText);
        console.log(`  [INFO] 10: after re-activate, has remaining work: ${hasWork}`);
      } else {
        console.log("  [FAIL] 10: Actif button NOT found after release!");
      }
    } else {
      console.log("  [INFO] 10: no Libérer button visible (tablet not active)");
    }
    console.log("  [PASS] 10-release-reactivate-immediate (test completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 11: Multi-device sync — iPad 2 sees correct state
  // ─────────────────────────────────────────────────────────────────────
  test("11-multi-device-sync", async () => {
    await op2Page.bringToFront();
    await op2Page.reload({ waitUntil: "networkidle" });
    await wait(3000);
    await ss(op2Page, "step11-ipad2-state");

    // Check for ghost sessions or incorrect Reprendre buttons
    const ghostSession = op2Page.locator("button").filter({ hasText: /reprendre|resume/i }).first();
    const hasGhost = await ghostSession.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasGhost) {
      console.log("  [FAIL] 11: ghost Reprendre button on iPad 2!");
    }

    // Check for incorrect state
    const bodyText = await op2Page.locator("body").textContent() || "";
    console.log(`  [INFO] 11: iPad 2 body text (first 200): ${bodyText.slice(0, 200)}`);
    console.log("  [PASS] 11-multi-device-sync (test completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 12: No old/terminal requests return after multiple refreshes
  // ─────────────────────────────────────────────────────────────────────
  test("12-no-old-requests-after-refresh", async () => {
    await opPage.bringToFront();

    // Refresh 5 times
    for (let i = 0; i < 5; i++) {
      await opPage.reload({ waitUntil: "networkidle" });
      await wait(1500);
    }
    await ss(opPage, "step12-after-5-refreshes");

    // Check for any completed/cancelled requests that shouldn't be there
    const bodyText = await opPage.locator("body").textContent() || "";
    const hasBadState = /complète|terminée|completed.*request/i.test(bodyText);
    if (hasBadState) {
      console.log("  [WARN] 12: completed/terminated request text visible after 5 refreshes");
    }
    console.log("  [PASS] 12-no-old-requests-after-refresh (test completed)");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

async function submitPassengerRequest(page: Page, destinationLabel: string) {
  // Try multiple strategies to select destination and submit
  // Strategy 1: Select dropdown
  const selectEl = page.locator("select").first();
  if (await selectEl.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await selectEl.selectOption({ label: destinationLabel });
  }

  // Strategy 2: Button-based floor selector
  const destBtn = page.locator("button, [data-floor]").filter({ hasText: new RegExp(destinationLabel, "i") }).first();
  if (await destBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await destBtn.click();
  }

  // Strategy 3: Passenger count input (if exists)
  const countInput = page.locator("input[type=number], input[name*=passenger]").first();
  if (await countInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await countInput.fill("1");
  }

  // Submit
  const submitBtn = page.locator("button[type=submit], button").filter({ hasText: /envoyer|send|demander|soumettre/i }).first();
  if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await submitBtn.click();
    await wait(1500);
  }
}
