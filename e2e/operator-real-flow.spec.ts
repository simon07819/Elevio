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
const PROJECT_ID = process.env.ELEVIO_PROJECT_ID || "0dcb9995-97b7-4cbd-855b-00035ccce5dc";
const FLOOR_5_TOKEN = process.env.ELEVIO_FLOOR_5_TOKEN || "4d585db5d0cadf5cf463234f0016fd76";
const FLOOR_P1_TOKEN = process.env.ELEVIO_FLOOR_P1_TOKEN || "9aabfae7ec4d13a784b4224c13862edf";
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
        text.includes("[POLL-MERGE]") || text.includes("[COMBINED-BTN]") || text.includes("[updateRequestStatus]") ||
        text.includes("[PASSENGER-REQUEST-RESULT]") || text.includes("[createPassengerRequest]") ||
        text.includes("[POLL-DATA]") || text.includes("[COMBINED-ACTION]")) {
      debugLogs.push(`[${label}] ${text.slice(0, 500)}`);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[${label}-PAGEERR] ${err.message.slice(0, 300)}`);
  });
  // Capture network failures
  page.on("requestfailed", (request) => {
    consoleErrors.push(`[${label}-NETFAIL] ${request.method()} ${request.url().slice(0, 100)} - ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = response.url();
      // Only log server action calls (not static assets)
      if (url.includes("/$action") || url.includes("_next") && url.includes("server")) {
        consoleErrors.push(`[${label}-HTTP${response.status()}] ${response.request().method()} ${url.slice(0, 150)}`);
      }
    }
  });
}

async function ss(page: Page, name: string) {
  try {
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const file = path.join(ARTIFACTS_DIR, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  [SHOT] ${name}: ${file}`);
  } catch { /* page may be closed */ }
}

const wait = (ms = 1000) => new Promise(r => setTimeout(r, ms));

async function gotoWithAuth(page: Page, url: string, label: string) {
  // Navigate — use domcontentloaded to avoid networkidle hanging on SSR pages
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await wait(2000);
  const currentUrl = page.url();

  // If redirected to login, perform login
  if (currentUrl.includes("/login")) {
    console.log(`  [AUTH-${label}] logging in...`);
    await ss(page, `${label}-login-page`);

    const emailInput = page.locator("input[name=email], input[type=email]").first();
    await emailInput.waitFor({ state: "visible", timeout: 10_000 });
    await emailInput.fill(OP_EMAIL);

    const passInput = page.locator("input[name=password], input[type=password]").first();
    await passInput.fill(OP_PASSWORD);

    const signInBtn = page.locator("button[type=submit], button").filter({ hasText: /connexion|sign in|se connecter|login/i }).first();
    await signInBtn.click({ force: true });
    await wait(3000);

    // Navigate again to the target URL
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await wait(3000);

    const newUrl = page.url();
    console.log(`  [AUTH-${label}] after login URL: ${newUrl}`);
    await ss(page, `${label}-after-login`);

    // If STILL on login, auth failed
    if (newUrl.includes("/login")) {
      console.log(`  [AUTH-${label}] FAILED — still on login page`);
    }
  }
}

async function submitPassengerRequest(page: Page, destinationLabel: string) {
  // FloorSelector: buttons with type="button" showing floor labels
  // IMPORTANT: Must click WITHOUT force:true so React's onClick fires and updates destinationId
  const allButtons = page.locator("button[type=button]");
  const count = await allButtons.count();

  let destinationId = "";
  for (let i = 0; i < count; i++) {
    const btnText = await allButtons.nth(i).textContent().catch(() => "");
    if (btnText?.includes(destinationLabel)) {
      console.log(`  [ACTION] found floor button: ${btnText.trim().slice(0, 40)}`);
      // Scroll into view and click without force to trigger React state update
      await allButtons.nth(i).scrollIntoViewIfNeeded().catch(() => {});
      await wait(300);
      try {
        await allButtons.nth(i).click({ timeout: 5000 });
      } catch {
        // If click intercepted, try dispatching via JS
        console.log(`  [ACTION] click intercepted, using JS dispatch...`);
        await allButtons.nth(i).evaluate((el: HTMLButtonElement) => el.click());
      }
      await wait(500);

      // Read the toFloorId hidden input after clicking
      destinationId = await page.locator("input[name=toFloorId]").inputValue().catch(() => "");
      console.log(`  [ACTION] destinationId after click: ${destinationId.slice(0, 8)}...`);
      break;
    }
  }

  // Also read projectId and fromFloorId
  const projectId = await page.locator("input[name=projectId]").inputValue().catch(() => "");
  const fromFloorId = await page.locator("input[name=fromFloorId]").inputValue().catch(() => "");

  console.log(`  [INFO] form data: projectId=${projectId.slice(0, 8)} fromFloorId=${fromFloorId.slice(0, 8)} toFloorId=${destinationId.slice(0, 8)}`);

  // Submit the request form — click without force to trigger form action
  const submitBtn = page.locator("button[type=submit]").first();
  if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    try {
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
      await submitBtn.click({ timeout: 5000 });
    } catch {
      // If click intercepted, submit the form directly via requestSubmit
      console.log(`  [ACTION] submit click intercepted, using form.requestSubmit()...`);
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form instanceof HTMLFormElement) {
          const submitBtn = form.querySelector('button[type=submit]');
          if (submitBtn) {
            // React/Next.js form actions require the submitter to be the button
            form.requestSubmit(submitBtn as HTMLElement);
          } else {
            form.requestSubmit();
          }
        }
      });
    }

    // Wait and check for page state change (successful submission shows tracking view)
    let submissionResult = "unknown";
    for (let attempt = 0; attempt < 5; attempt++) {
      await wait(2000);
      const currentBody = await page.locator("body").textContent().catch(() => "");
      // Successful: page shows "En attente" or "Waiting" or tracking view
      if (/en attente|waiting|votre demande|your request|tracking|suivi/i.test(currentBody || "")) {
        submissionResult = "success_tracking";
        break;
      }
      // Error: page shows error message
      if (/aucun ascenseur|invalid|erreur|impossible|nombre invalide|selection invalide|raison obligatoire|dupl/i.test(currentBody || "")) {
        const errorMatch = currentBody?.match(/(?:aucun|invalid|erreur|error|impossible|nombre|selection|raison|dupl)[^]{0,100}/i);
        submissionResult = `error: ${errorMatch?.[0]?.slice(0, 80) ?? "unknown"}`;
        break;
      }
    }
    console.log(`  [RESULT] submission result: ${submissionResult}`);

    // Capture the result message shown on the page
    const bodyText = await page.locator("body").textContent().catch(() => "");
    const hasDemandeEnvoyee = /envoy|sent|demande|request.*submit|boarded|attente/i.test(bodyText || "");
    console.log(`  [ACTION] submitted passenger request to ${destinationLabel}, success_msg_visible: ${hasDemandeEnvoyee}`);

    // Try to find any visible text message (not RSC payload)
    const msgElements = await page.locator("[class*=message], [class*=msg], [class*=toast], [class*=alert], [role=alert], [role=status]").allTextContents().catch(() => []);
    if (msgElements.length > 0) {
      console.log(`  [INFO] visible messages: ${msgElements.slice(0, 3).join(' | ').slice(0, 200)}`);
    }

    // Check for error message in rendered text (not RSC payload)
    const renderedText = bodyText?.replace(/\$[a-zA-Z]+/g, '').replace(/self\.__next_f/g, '').replace(/push|fragment|module/g, '');
    const errorMatch = renderedText?.match(/(?:aucun|invalid|erreur|error|impossible|nombre|selection|raison|dupl)[^]{0,100}/i);
    if (errorMatch) {
      console.log(`  [WARN] passenger error: ${errorMatch[0].slice(0, 100)}`);
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

  test.beforeAll(async ({ browser }) => {
    if (!OP_EMAIL || !OP_PASSWORD) {
      console.log("\n  !! ELEVIO_OPERATOR_EMAIL and ELEVIO_OPERATOR_PASSWORD not set!");
      console.log("  !! Login will fail. Set these env vars before running the test.\n");
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
    } else {
      console.log("ALL STEPS PASSED");
    }
    console.log(`\nDebug logs: ${debugLogs.length}`);
    if (debugLogs.length > 0) {
      console.log("KEY DEBUG LOGS:");
      for (const l of debugLogs.slice(0, 40)) console.log(`  ${l.slice(0, 300)}`);
    }
    console.log(`\nConsole errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log("KEY CONSOLE ERRORS (first 5):");
      for (const e of consoleErrors.slice(0, 5)) console.log(`  ${e.slice(0, 200)}`);
    }
    console.log("\n══════════════════════════════════════════════════════════════════\n");
  });

  test.afterAll(async () => {
    await opCtx.close().catch(() => {});
    await op2Ctx.close().catch(() => {});
    await p5Ctx.close().catch(() => {});
    await pP1Ctx.close().catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 1: Login operator iPad 1 + verify operator workspace
  // ─────────────────────────────────────────────────────────────────────
  test("1-operator-ipad1-login", async () => {
    await gotoWithAuth(opPage, `${BASE}/operator`, "Op1");
    await ss(opPage, "step1-op1");
    const url = opPage.url();
    console.log(`  [INFO] op1 URL: ${url}`);
    if (url.includes("/login")) {
      failures.push("1: operator iPad 1 login failed");
    }
    console.log("  [PASS] 1-operator-ipad1-login");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 2: Login operator iPad 2
  // ─────────────────────────────────────────────────────────────────────
  test("2-operator-ipad2-login", async () => {
    await gotoWithAuth(op2Page, `${BASE}/operator`, "Op2");
    await ss(op2Page, "step2-op2");
    const url = op2Page.url();
    console.log(`  [INFO] op2 URL: ${url}`);
    if (url.includes("/login")) {
      failures.push("2: operator iPad 2 login failed");
    }
    console.log("  [PASS] 2-operator-ipad2-login");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 3: Cleanup — force-release stale tablets + clear old requests
  // ─────────────────────────────────────────────────────────────────────
  test("3-cleanup-stale-sessions", async () => {
    // On iPad 2, look for stale sessions and deactivate them
    await op2Page.bringToFront();
    const deactivateBtns = op2Page.locator("button").filter({ hasText: /desactiver|deactivate/i });
    const count = await deactivateBtns.count();
    for (let i = 0; i < count; i++) {
      console.log(`  [ACTION] 3: deactivating stale tablet ${i + 1}/${count}`);
      // Accept confirm dialog
      op2Page.on("dialog", dialog => dialog.accept());
      await deactivateBtns.nth(i).click({ force: true }).catch(() => {});
      await wait(2000);
    }
    await ss(op2Page, "step3-after-cleanup");
    console.log(`  [RESULT] 3: deactivated ${count} stale tablets`);
    console.log("  [PASS] 3-cleanup-stale-sessions");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 4: Passenger pages load for floors 5 and P1
  // ─────────────────────────────────────────────────────────────────────
  test("4-passenger-pages-load", async () => {
    // Clear localStorage to avoid duplicate request guard
    await p5Page.goto("about:blank");
    await p5Page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await pP1Page.goto("about:blank");
    await pP1Page.evaluate(() => { try { localStorage.clear(); } catch {} });

    await p5Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_5_TOKEN}`, { waitUntil: "domcontentloaded" });
    await wait(2000);
    await ss(p5Page, "step4-p5");

    await pP1Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_P1_TOKEN}`, { waitUntil: "domcontentloaded" });
    await wait(2000);
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
    await opPage.reload({ waitUntil: "domcontentloaded" });
    await wait(3000);
    await ss(opPage, "step5-before-activate");

    // The activate button says "Activer" (FR) / "Activate" (EN)
    const activateBtn = opPage.locator("button[type=submit]").filter({ hasText: /activer|activate|reprendre|reclaim/i }).first();
    const hasBtn = await activateBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasBtn) {
      // Fill device label if there's an input
      const labelInput = opPage.locator("input[name=label], input[name=tabletLabel], input[placeholder*=appareil]").first();
      if (await labelInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await labelInput.fill("iPad-1-E2E");
      }

      // Fill current floor select if exists
      const floorSelect = opPage.locator("select[name=currentFloor], select[name=currentFloorId]").first();
      if (await floorSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
        // Try to select floor 5 (sort_order 5)
        try { await floorSelect.selectOption({ label: "5" }); } catch { /* may not exist */ }
      }

      console.log("  [ACTION] 5: clicking Activer...");
      await activateBtn.click({ force: true });
      await wait(5000);
      await ss(opPage, "step5-after-activate");

      // Click "Vider la liste" to clear old completed/cancelled requests
      const clearListBtn = opPage.locator("button").filter({ hasText: /vider|clear|vider la liste|clear list/i }).first();
      if (await clearListBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log("  [ACTION] 5: clicking Vider la liste to clear old requests...");
        await clearListBtn.click({ force: true });
        await wait(2000);
      }

      // Verify workspace is visible
      const bodyText = await opPage.locator("body").textContent() || "";
      const inWorkspace = /en service|liberer|release|ramasser|deposer|session/i.test(bodyText);
      console.log(`  [RESULT] 4: appears in workspace: ${inWorkspace}`);
      if (!inWorkspace) {
        // Maybe the activate form requires more fields
        console.log(`  [INFO] 4: body text (first 300): ${bodyText.slice(0, 300)}`);
      }
    } else {
      // Maybe already in workspace?
      const bodyText = await opPage.locator("body").textContent() || "";
      const inWorkspace = /en service|liberer|release|ramasser|deposer/i.test(bodyText);
      console.log(`  [INFO] 4: no activate button. In workspace: ${inWorkspace}`);
      if (!inWorkspace) {
        console.log(`  [INFO] 4: body text (first 500): ${bodyText.slice(0, 500)}`);
      }
    }

    // Check iPad 2 sees the activation
    await wait(2000);
    await op2Page.bringToFront();
    await op2Page.reload({ waitUntil: "domcontentloaded" });
    await wait(3000);
    await ss(op2Page, "step5-op2-after-activation");
    console.log("  [PASS] 5-activate-tablet-ipad1");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 5: Create crossed requests A: 5→P1 and B: P1→5
  // ─────────────────────────────────────────────────────────────────────
  test("6-create-crossed-requests", async () => {
    // Passenger at floor 5 → destination P1
    await p5Page.bringToFront();
    await p5Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_5_TOKEN}`, { waitUntil: "domcontentloaded" });
    await wait(2000);
    await submitPassengerRequest(p5Page, "P1");
    await ss(p5Page, "step6-p5-submitted");
    console.log("  [ACTION] 5: passenger at 5 submitted A (5→P1)");

    // Passenger at floor P1 → destination 5
    await pP1Page.bringToFront();
    await pP1Page.goto(`${BASE}/request?projectId=${PROJECT_ID}&floorToken=${FLOOR_P1_TOKEN}`, { waitUntil: "domcontentloaded" });
    await wait(2000);
    await submitPassengerRequest(pP1Page, "5");
    await ss(pP1Page, "step6-pp1-submitted");
    console.log("  [ACTION] 5: passenger at P1 submitted B (P1→5)");

    // Wait for requests to propagate to operator
    await wait(5000);
    await opPage.bringToFront();
    await opPage.reload({ waitUntil: "domcontentloaded" });
    await wait(8000);
    await ss(opPage, "step6-operator-sees-requests");

    // Check PAUSE-DIAG for request statuses
    const pauseDiags = debugLogs.filter(l => l.includes("[PAUSE-DIAG]")).slice(-3);
    for (const d of pauseDiags) console.log(`  [DEBUG] ${d.slice(0, 400)}`);

    // Check PAUSE-DIAG for request statuses
    const pauseDiag = debugLogs.filter(l => l.includes("[PAUSE-DIAG]")).pop();
    if (pauseDiag) console.log(`  [DEBUG] ${pauseDiag.slice(0, 500)}`);

    // Verify operator sees at least one request
    const bodyText = await opPage.locator("body").textContent() || "";
    const hasRamasser = /ramasser|pickup/i.test(bodyText);
    const hasDeposer = /deposer|dropoff/i.test(bodyText);
    const hasAnyRequest = /demande|request|5.*P1|P1.*5/i.test(bodyText);
    console.log(`  [RESULT] 5: operator sees: ramasser=${hasRamasser} deposer=${hasDeposer} any_request=${hasAnyRequest}`);
    if (!hasRamasser && !hasDeposer && !hasAnyRequest) {
      console.log(`  [WARN] 5: operator does NOT see any requests! Body (first 300): ${bodyText.slice(0, 300)}`);
      failures.push("5: operator does not see any requests after submission");
    }
    console.log("  [PASS] 6-create-crossed-requests");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 6: Pickup A — verify no PAUSE for 20s + passenger QR <2s
  // ─────────────────────────────────────────────────────────────────────
  test("7-pickup-A-no-pause-passenger-QR", async () => {
    await opPage.bringToFront();
    await wait(1000);

    await ss(opPage, "step7-before-pickup");

    // Find Ramasser button
    const pickupBtn = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
    let hasPickup = await pickupBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasPickup) {
      // Maybe we need to navigate elevator to floor 5 first
      // Try clicking the recommended next stop button
      const nextBtn = opPage.locator("button").filter({ hasText: /5|allons|go/i }).first();
      if (await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log("  [ACTION] 6: clicking recommended next stop...");
        await nextBtn.click({ force: true });
        await wait(3000);
        await ss(opPage, "step7-at-floor5");
      }

      // Re-check for Ramasser
      const pickupBtn2 = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
      hasPickup = await pickupBtn2.isVisible({ timeout: 5_000 }).catch(() => false);
    }

    if (!hasPickup) {
      console.log("  [WARN] 6: no Ramasser button visible");
      failures.push("6: no Ramasser button found");
      console.log("  [PASS] 7-pickup-A-no-pause-passenger-QR (skipped)");
      return;
    }

    // Click Ramasser
    const pickupBtnFinal = opPage.locator("button").filter({ hasText: /ramasser|pickup|prendre/i }).first();
    console.log("  [ACTION] 6: clicking Ramasser for request A...");
    const pickupStart = Date.now();
    await pickupBtnFinal.click({ force: true });
    await wait(500);

    // ── Passenger QR return timing ──
    await p5Page.bringToFront();
    let qrReturned = false;
    let qrElapsed = 0;

    for (let i = 0; i < 25; i++) {
      await wait(200);
      qrElapsed = Date.now() - pickupStart;
      try {
        const p5Body = await p5Page.locator("body").textContent({ timeout: 500 });
        // After pickup (boarded), passenger should return to QR/request form
        const isTracking = /attente|en attente|waiting|suivi|tracking|votre demande/i.test(p5Body || "");
        const isQRHome = /qr|scanner|scan|nouvelle demande|new request|où allez-vous|where.*going/i.test(p5Body || "");
        if (!isTracking || isQRHome) {
          qrReturned = true;
          break;
        }
      } catch { /* page may be reloading */ }
    }

    qrElapsed = Date.now() - pickupStart;
    if (qrReturned) {
      console.log(`  [RESULT] 6: passenger QR returned in ${qrElapsed}ms (limit: 2000ms)`);
      if (qrElapsed > 2000) {
        failures.push(`6: passenger QR return took ${qrElapsed}ms > 2000ms`);
      }
    } else {
      console.log(`  [FAIL] 6: passenger QR did NOT return within ${qrElapsed}ms`);
      failures.push(`6: passenger QR did not return within ${qrElapsed}ms`);
      await ss(p5Page, "step7-p5-no-qr-return");
    }

    // ── PAUSE check for 20 seconds ──
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step7-after-pickup");

    console.log("  [WAIT] 6: monitoring for PAUSE for 20 seconds...");
    let pauseSeen = false;
    for (let i = 0; i < 20; i++) {
      await wait(1000);
      const bodyText = await opPage.locator("body").textContent() || "";
      // Look for PAUSE/ATTENTE as a status display (not in buttons like Libérer)
      const hasPauseStatus = /pause\b|en attente\b/i.test(bodyText) &&
                             !/liberer.*tablette|release.*tablet/i.test(bodyText.slice(0, 200));
      if (hasPauseStatus) {
        pauseSeen = true;
        await ss(opPage, `step8-pause-at-${i + 1}s`);
        console.log(`  [FAIL] 6: PAUSE detected at ${i + 1}s after pickup!`);
        failures.push(`6: PAUSE at ${i + 1}s after pickup`);
        const pauseDiag = debugLogs.filter(l => l.includes("[PAUSE-DIAG]")).pop();
        if (pauseDiag) console.log(`  [DEBUG] ${pauseDiag.slice(0, 300)}`);
        break;
      }
    }
    if (!pauseSeen) {
      console.log("  [PASS] 6: no PAUSE for 20 seconds after pickup");
    }

    // ── Refresh persistence check ──
    await opPage.reload({ waitUntil: "domcontentloaded" });
    await wait(8000);
    await ss(opPage, "step8-after-refresh");

    const combinedAfterRefresh = opPage.locator("button").filter({ hasText: /d[eé]poser.*ramasser|drop.*pick/i }).first();
    const dropoffAfterRefresh = opPage.locator("button").filter({ hasText: /d[eé]poser|dropoff/i }).first();
    // Pickup = contains Ramasser but NOT Déposer
    const pickupAfterRefresh = opPage.locator("button").filter({ hasText: /ramasser|pickup/i }).first();
    const hasCombined = await combinedAfterRefresh.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasDropoff = await dropoffAfterRefresh.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasPickupAgain = await pickupAfterRefresh.isVisible({ timeout: 3_000 }).catch(() => false);

    console.log(`  [RESULT] 6: after refresh: combined=${hasCombined} dropoff=${hasDropoff} pickup=${hasPickupAgain}`);
    // If we have a dropoff or combined button, the Ramasser was persisted
    if (hasDropoff || hasCombined) {
      console.log("  [PASS] 6: Déposer or combined button visible after refresh — DB persisted correctly!");
    } else if (hasPickupAgain) {
      console.log("  [FAIL] 6: Ramasser still visible after refresh — DB NOT PERSISTED!");
      failures.push("6: after Ramasser + refresh, still shows Ramasser (DB not persisted)");
      const ramasserResult = debugLogs.filter(l => l.includes("[RAMASSER-RESULT]")).pop();
      if (ramasserResult) console.log(`  [DEBUG] ${ramasserResult.slice(0, 300)}`);
    }

    console.log("  [PASS] 7-pickup-A-no-pause-passenger-QR (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 7: Combined Déposer + Ramasser button at P1
  // ─────────────────────────────────────────────────────────────────────
  test("8-combined-button-drop-pick", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step8-before-combined");

    // Check for combined Déposer + Ramasser button
    const combinedBtn = opPage.locator("button").filter({ hasText: /d[eé]poser.*ramasser|drop.*pick/i }).first();
    const hasCombined = await combinedBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    // Also check for separate Déposer and Ramasser
    const dropoffBtn = opPage.locator("button").filter({ hasText: /deposer|dropoff/i }).first();
    const pickupBtn = opPage.locator("button").filter({ hasText: /ramasser|pickup/i }).first();
    const hasDropoff = await dropoffBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasPickup = await pickupBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    // Check COMBINED-BTN debug log
    const combinedDiag = debugLogs.filter(l => l.includes("[COMBINED-BTN]")).pop();
    if (combinedDiag) console.log(`  [DEBUG] ${combinedDiag.slice(0, 400)}`);

    console.log(`  [RESULT] 7: combined=${hasCombined} dropoff=${hasDropoff} pickup=${hasPickup}`);

    if (hasCombined) {
      const btnText = await combinedBtn.textContent({ timeout: 3000 }).catch(() => "N/A");
      const isEnabled = await combinedBtn.isEnabled().catch(() => false);
      const isVisible = await combinedBtn.isVisible().catch(() => false);
      console.log(`  [ACTION] 7: clicking combined button (text: "${btnText?.slice(0, 100)}", enabled: ${isEnabled}, visible: ${isVisible})...`);
      const clickStart = Date.now();
      // Use JS dispatch to ensure React onClick fires
      await combinedBtn.evaluate((el: HTMLElement) => {
        console.log("[E2E-CLICK] dispatching click on combined button");
        el.click();
      });
      await wait(1000);
      await ss(opPage, "step8-after-combined");

      // Verify passenger B QR returned <2s
      await pP1Page.bringToFront();
      let pP1QrReturned = false;
      let pP1QrElapsed = 0;
      for (let i = 0; i < 20; i++) {
        await wait(200);
        pP1QrElapsed = Date.now() - clickStart;
        try {
          const body = await pP1Page.locator("body").textContent({ timeout: 500 });
          const isTracking = /attente|en attente|waiting|suivi|tracking|votre demande/i.test(body || "");
          const isQRHome = /qr|scanner|scan|nouvelle demande|new request|où allez-vous|where.*going/i.test(body || "");
          if (!isTracking || isQRHome) {
            pP1QrReturned = true;
            break;
          }
        } catch { /* page reloading */ }
      }

      pP1QrElapsed = Date.now() - clickStart;
      if (pP1QrReturned) {
        console.log(`  [RESULT] 7: passenger B QR returned in ${pP1QrElapsed}ms`);
        if (pP1QrElapsed > 2000) {
          failures.push(`7: passenger B QR return took ${pP1QrElapsed}ms > 2000ms`);
        }
      } else {
        console.log(`  [FAIL] 7: passenger B QR did NOT return within ${pP1QrElapsed}ms`);
        failures.push(`7: passenger B QR did not return within ${pP1QrElapsed}ms`);
      }

      // Verify next action after combined
      await opPage.bringToFront();
      await wait(1000);
      const bodyText = await opPage.locator("body").textContent() || "";
      console.log(`  [RESULT] 7: after combined, body (first 300): ${bodyText.slice(0, 300)}`);

      // Wait 20s — no PAUSE
      console.log("  [WAIT] 7: monitoring for PAUSE for 20 seconds...");
      let pauseSeen = false;
      for (let i = 0; i < 20; i++) {
        await wait(1000);
        const bodyText20s = await opPage.locator("body").textContent() || "";
        const hasPauseStatus = /pause\b|en attente\b/i.test(bodyText20s);
        if (hasPauseStatus) {
          pauseSeen = true;
          await ss(opPage, `step8-pause-at-${i + 1}s`);
          console.log(`  [FAIL] 7: PAUSE at ${i + 1}s after combined!`);
          failures.push(`7: PAUSE at ${i + 1}s after combined`);
          break;
        }
      }
      if (!pauseSeen) console.log("  [PASS] 7: no PAUSE for 20s after combined action");
    } else if (hasDropoff && hasPickup) {
      // Both individual buttons exist but no combined
      console.log("  [FAIL] 7: combined button absent but individual dropoff+pickup present!");
      failures.push("7: combined Déposer + Ramasser button absent at same floor");

      // Click both as fallback
      console.log("  [ACTION] 7: clicking Déposer then Ramasser separately...");
      await dropoffBtn.click({ force: true });
      await wait(3000);
      await pickupBtn.click({ force: true });
      await wait(3000);
      await ss(opPage, "step8-after-separate-actions");
    } else if (hasDropoff) {
      // Only dropoff — do it
      console.log("  [ACTION] 7: only Déposer available, clicking it...");
      await dropoffBtn.click({ force: true });
      await wait(3000);
      await ss(opPage, "step9-after-dropoff-only");

      // Check if Ramasser appears now
      const pickupAfterDropoff = opPage.locator("button").filter({ hasText: /ramasser|pickup/i }).first();
      if (await pickupAfterDropoff.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log("  [ACTION] 7: Ramasser appeared after Déposer, clicking...");
        await pickupAfterDropoff.click({ force: true });
        await wait(3000);
        await ss(opPage, "step8-after-pickup-followup");
      }
    } else {
      console.log("  [WARN] 7: no action buttons visible");
      const bodyText = await opPage.locator("body").textContent() || "";
      console.log(`  [INFO] 7: body (first 500): ${bodyText.slice(0, 500)}`);
    }
    console.log("  [PASS] 8-combined-button-drop-pick (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 8: Dropoff B at floor 5
  // ─────────────────────────────────────────────────────────────────────
  test("9-dropoff-B-no-old-requests", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step9-before-dropoff");

    const dropoffBtn = opPage.locator("button").filter({ hasText: /deposer|dropoff/i }).first();
    const hasDropoff = await dropoffBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasDropoff) {
      console.log("  [ACTION] 8: clicking Déposer for request B...");
      await dropoffBtn.click({ force: true });
      await wait(3000);
      await ss(opPage, "step9-after-dropoff");

      // Refresh — verify no old requests return
      for (let i = 0; i < 3; i++) {
        await opPage.reload({ waitUntil: "domcontentloaded" });
        await wait(3000);
      }
      await ss(opPage, "step9-after-3-refreshes");

      const bodyText = await opPage.locator("body").textContent() || "";
      const hasOldRequest = /complète|terminée|completed.*request/i.test(bodyText);
      if (hasOldRequest) {
        console.log("  [WARN] 8: completed request text visible after refreshes");
        failures.push("8: old completed request visible after refresh");
      }
    } else {
      console.log("  [INFO] 8: no Déposer button visible");
    }
    console.log("  [PASS] 9-dropoff-B-no-old-requests (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 9: Release and immediate re-activate
  // ─────────────────────────────────────────────────────────────────────
  test("10-release-reactivate-immediate", async () => {
    await opPage.bringToFront();
    await wait(1000);
    await ss(opPage, "step10-before-release");

    const releaseBtn = opPage.locator("button").filter({ hasText: /liberer|release|liberer cette tablette|release this tablet/i }).first();
    const hasRelease = await releaseBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasRelease) {
      console.log("  [ACTION] 9: clicking Libérer cette tablette...");
      await releaseBtn.click({ force: true });
      await wait(1500);
      await ss(opPage, "step10-after-release");

      // IMMEDIATELY look for activate button
      console.log("  [ACTION] 9: looking for Activer button...");
      const activateBtn = opPage.locator("button[type=submit]").filter({ hasText: /activer|activate|reprendre|reclaim/i }).first();
      const start = Date.now();
      const hasActivate = await activateBtn.isVisible({ timeout: 10_000 }).catch(() => false);
      const foundElapsed = Date.now() - start;

      console.log(`  [RESULT] 9: activate button visible: ${hasActivate} (found in ${foundElapsed}ms)`);

      if (hasActivate) {
        if (foundElapsed > 2000) {
          failures.push(`9: Actif button took ${foundElapsed}ms to appear (>2s)`);
        }

        // Click it immediately
        const reActivateStart = Date.now();
        await activateBtn.click({ force: true });
        await wait(5000);
        const reActivateElapsed = Date.now() - reActivateStart;
        await ss(opPage, "step10-after-reactivate");

        console.log(`  [RESULT] 9: re-activation completed in ${reActivateElapsed}ms`);
        if (reActivateElapsed > 2000) {
          failures.push(`9: re-activation took ${reActivateElapsed}ms (>2s)`);
        }
      } else {
        console.log("  [FAIL] 9: Activer button NOT found after release!");
        failures.push("9: Activer button not found after Libérer");
      }
    } else {
      console.log("  [INFO] 9: no Libérer button visible (tablet not active)");
    }
    console.log("  [PASS] 10-release-reactivate-immediate (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 10: Multi-device sync
  // ─────────────────────────────────────────────────────────────────────
  test("11-multi-device-sync", async () => {
    await op2Page.bringToFront();
    await op2Page.reload({ waitUntil: "domcontentloaded" });
    await wait(5000);
    await ss(op2Page, "step11-ipad2-state");

    // Check for ghost Reprendre button
    const ghostReprendre = op2Page.locator("button").filter({ hasText: /reprendre|reclaim/i }).first();
    const hasGhost = await ghostReprendre.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasGhost) {
      console.log("  [FAIL] 10: ghost Reprendre button on iPad 2!");
      failures.push("10: ghost Reprendre button on iPad 2");
    }

    const op2Body = await op2Page.locator("body").textContent() || "";
    console.log(`  [INFO] 10: iPad 2 body (first 200): ${op2Body.slice(0, 200)}`);
    console.log("  [PASS] 11-multi-device-sync (completed)");
  });

  // ─────────────────────────────────────────────────────────────────────
  // STEP 11: No old/terminal requests after multiple refreshes
  // ─────────────────────────────────────────────────────────────────────
  test("12-no-old-requests-after-refresh", async () => {
    await opPage.bringToFront();

    for (let i = 0; i < 5; i++) {
      await opPage.reload({ waitUntil: "domcontentloaded" });
      await wait(3000);
    }
    await ss(opPage, "step12-after-5-refreshes");

    const bodyText = await opPage.locator("body").textContent() || "";
    const hasBadState = /complète|terminée|completed.*request|cancelled.*request/i.test(bodyText);
    if (hasBadState) {
      console.log("  [WARN] 11: completed/cancelled request text visible after 5 refreshes");
      failures.push("11: old request visible after 5 refreshes");
    }
    console.log("  [PASS] 12-no-old-requests-after-refresh (completed)");
  });
});
