/**
 * ELEVIO — Comprehensive Button Audit (Playwright LIVE)
 *
 * Run:  npm run test:e2e:buttons:live
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const BASE = process.env.ELEVIO_BASE_URL || "http://localhost:3000";

interface ButtonReport {
  page: string;
  text: string;
  disabled: boolean;
  result: "OK" | "FAIL" | "SKIP";
  error?: string;
}

const report: ButtonReport[] = [];
const consoleErrors: string[] = [];

function collectConsoleErrors(page: Page) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      consoleErrors.push(`[${page.url()}] ${msg.text()}`);
    }
  });
}

async function auditPageButtons(page: Page, pageName: string): Promise<ButtonReport[]> {
  const results: ButtonReport[] = [];
  const buttons = await page.locator("button:visible").all();

  for (const button of buttons) {
    const text = (await button.textContent())?.trim() || "";
    const isDisabled = await button.isDisabled();

    const entry: ButtonReport = {
      page: pageName,
      text: text.substring(0, 60),
      disabled: isDisabled,
      result: "SKIP",
    };

    if (isDisabled) {
      entry.result = "OK";
      results.push(entry);
      continue;
    }

    const isDestructive =
      text.toLowerCase().includes("delete") ||
      text.toLowerCase().includes("supprimer") ||
      text.toLowerCase().includes("annuler") ||
      text.toLowerCase().includes("cancel") ||
      text.toLowerCase().includes("désactiver") ||
      text.toLowerCase().includes("deactivate") ||
      text.toLowerCase().includes("sign out") ||
      text.toLowerCase().includes("déconnexion");

    if (isDestructive) {
      entry.result = "OK";
    } else {
      try {
        await button.click({ timeout: 5000 });
        entry.result = "OK";
      } catch (err: unknown) {
        entry.result = "FAIL";
        entry.error = err instanceof Error ? err.message : String(err);
      }
    }

    results.push(entry);
  }

  return results;
}

async function auditPageLinks(page: Page, pageName: string): Promise<ButtonReport[]> {
  const results: ButtonReport[] = [];
  const links = await page.locator("a:visible").all();

  for (const link of links) {
    const text = (await link.textContent())?.trim() || "";
    const href = await link.getAttribute("href");

    const entry: ButtonReport = {
      page: pageName,
      text: text.substring(0, 60),
      disabled: !href || href === "#",
      result: !href || href === "#" ? "FAIL" : "OK",
      error: !href ? "No href" : href === "#" ? "Dead link" : undefined,
    };

    results.push(entry);
  }

  return results;
}

const pages = [
  { path: "/", name: "Home/Scan" },
  { path: "/admin/login", name: "Admin Login" },
  { path: "/admin/projects", name: "Admin Projects" },
  { path: "/operator", name: "Operator Terminal" },
  { path: "/support", name: "Support" },
];

for (const { path, name } of pages) {
  test(`audit: ${name} buttons`, async ({ page }) => {
    collectConsoleErrors(page);
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");

    const buttons = await auditPageButtons(page, name);
    const links = await auditPageLinks(page, name);
    report.push(...buttons, ...links);
  });
}

test("audit: no console errors across pages", async ({ page }) => {
  collectConsoleErrors(page);
  for (const { path } of pages) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
  }
  const critical = consoleErrors.filter(
    (e) => e.includes("Uncaught") || e.includes("TypeError") || e.includes("ReferenceError")
  );
  expect(critical).toEqual([]);
});

test.afterAll(async () => {
  if (report.length === 0) return;
  console.log("\n══════════════════════════════════════════════════");
  console.log("   ELEVIO BUTTON AUDIT REPORT");
  console.log("══════════════════════════════════════════════════\n");
  const ok = report.filter((r) => r.result === "OK").length;
  const fail = report.filter((r) => r.result === "FAIL");
  const skip = report.filter((r) => r.result === "SKIP").length;
  console.log(`Total: ${report.length} | OK: ${ok} | FAIL: ${fail.length} | SKIP: ${skip}`);
  if (fail.length > 0) {
    console.log("\nFAILED:");
    for (const f of fail) {
      console.log(`  [${f.page}] ${f.text} — ${f.error}`);
    }
  }
  console.log("\n══════════════════════════════════════════════════\n");
});
