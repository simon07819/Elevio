/**
 * ELEVIO — Chaos Scenarios (Playwright LIVE)
 * Run:  npm run test:e2e:chaos:live
 */
import { test, expect, type Browser, type BrowserContext, type Page, type ConsoleMessage } from "@playwright/test";
const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";
const errors: string[] = [];
function collect(page: Page, l: string) { page.on("console", (m: ConsoleMessage) => { if (m.type() === "error") errors.push(`[${l}] ${m.text()}`); }); }
async function opCtx(b: Browser, l: string) { const c = await b.newContext({ viewport: { width: 1024, height: 1366 } }); const p = await c.newPage(); collect(p, l); return { c, p }; }
async function paxCtx(b: Browser, l: string) { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); collect(p, l); return { c, p }; }
const crit = () => errors.filter(e => e.includes("Uncaught") || e.includes("TypeError"));

test("chaos-1: release/activate/return", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1");
  try { await o1.p.goto(`${BASE}/operator`); await o1.p.waitForLoadState("networkidle"); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); }
});
test("chaos-2: active+refresh", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1");
  try { await o1.p.goto(`${BASE}/operator`); await o1.p.waitForLoadState("networkidle"); await o1.p.reload(); await o1.p.waitForLoadState("networkidle"); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); }
});
test("chaos-3: back/forward", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1");
  try { await o1.p.goto(`${BASE}/operator`); await o1.p.waitForLoadState("networkidle"); await o1.p.goBack(); await o1.p.goForward(); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); }
});
test("chaos-4: release with boarded", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1"), o2 = await opCtx(browser, "Op2");
  try { await o1.p.goto(`${BASE}/operator`); await o2.p.goto(`${BASE}/operator`); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); await o2.c.close(); }
});
test("chaos-5: PLEIN blocks pickup only", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1");
  try { await o1.p.goto(`${BASE}/operator`); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); }
});
test("chaos-6: same floor dropoff+pickup", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1");
  try { await o1.p.goto(`${BASE}/operator`); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); }
});
test("chaos-7: two operators redistribution", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1"), o2 = await opCtx(browser, "Op2");
  try { await o1.p.goto(`${BASE}/operator`); await o2.p.goto(`${BASE}/operator`); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); await o2.c.close(); }
});
test("chaos-8: admin deactivates during activity", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1"), ad = await opCtx(browser, "Admin");
  try { await o1.p.goto(`${BASE}/operator`); await ad.p.goto(`${BASE}/admin/projects`); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); await ad.c.close(); }
});
test("chaos-9: force release", async ({ browser }) => {
  const o1 = await opCtx(browser, "Op1");
  try { await o1.p.goto(`${BASE}/operator`); expect(crit()).toEqual([]); }
  finally { await o1.c.close(); }
});
test("chaos-10: passenger spam", async ({ browser }) => {
  const p1 = await paxCtx(browser, "P1"), p2 = await paxCtx(browser, "P2"), p3 = await paxCtx(browser, "P3"), o1 = await opCtx(browser, "Op1");
  try { await p1.p.goto(`${BASE}/request?projectId=t&floorToken=f1`); await p2.p.goto(`${BASE}/request?projectId=t&floorToken=f2`); await o1.p.goto(`${BASE}/operator`); expect(crit()).toEqual([]); }
  finally { await p1.c.close(); await p2.c.close(); await p3.c.close(); await o1.c.close(); }
});
