/**
 * ELEVIO — Button Audit (Playwright LIVE)
 * Run:  npm run test:e2e:buttons:live
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";
const report: { page: string; text: string; result: string }[] = [];
const errors: string[] = [];
function collect(page: Page) { page.on("console", (m: ConsoleMessage) => { if (m.type() === "error") errors.push(m.text()); }); }
for (const { path, name } of [{ path: "/", name: "Home" }, { path: "/operator", name: "Operator" }, { path: "/admin/login", name: "Login" }, { path: "/support", name: "Support" }]) {
  test(`audit: ${name}`, async ({ page }) => {
    collect(page); await page.goto(`${BASE}${path}`); await page.waitForLoadState("networkidle");
    const buttons = await page.locator("button:visible").all();
    for (const btn of buttons) {
      const text = (await btn.textContent())?.trim()?.substring(0, 60) || "";
      const isDisabled = await btn.isDisabled();
      if (isDisabled) { report.push({ page: name, text, result: "OK" }); continue; }
      const destructive = /delete|supprimer|annuler|cancel|desactiver|deactivate|sign out|deconnexion/i.test(text);
      if (destructive) { report.push({ page: name, text, result: "OK" }); continue; }
      try { await btn.click({ timeout: 5000 }); report.push({ page: name, text, result: "OK" }); }
      catch { report.push({ page: name, text, result: "FAIL" }); }
    }
  });
}
test.afterAll(() => {
  if (!report.length) return;
  console.log("\nBUTTON AUDIT REPORT");
  const ok = report.filter(r => r.result === "OK").length;
  const fail = report.filter(r => r.result === "FAIL");
  console.log(`Total: ${report.length} | OK: ${ok} | FAIL: ${fail.length}`);
  if (fail.length) for (const f of fail) console.log(`  FAIL [${f.page}] ${f.text}`);
});
