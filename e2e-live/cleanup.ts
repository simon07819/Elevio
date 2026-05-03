import type { Page } from "@playwright/test";

/**
 * Data cleanup utility — deletes test project and all child records after suite.
 * Uses admin page to delete project via UI (server action).
 */

const TEST_PROJECT_PREFIX = "E2E Test";

/**
 * Find and delete all test projects via the admin UI.
 * Called in afterAll hook.
 */
export async function cleanupTestProjects(page: Page) {
  // Navigate to admin projects page
  await page.goto("/admin/projects");
  await page.waitForLoadState("networkidle");

  // Find all project cards that start with our test prefix
  const projectCards = page.locator(`[class*="rounded"] >> text=/${TEST_PROJECT_PREFIX}/i`);
  const count = await projectCards.count();

  for (let i = 0; i < count; i++) {
    // Each project card should have a delete button
    const deleteBtn = page.getByRole("button", { name: /supprimer|delete/i }).nth(i);
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      // Confirm deletion if dialog appears
      const confirmBtn = page.getByRole("button", { name: /confirmer|confirm|oui|yes/i });
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(1000);
    }
  }
}

/**
 * Response time measurement helper.
 * Returns ms elapsed for an action.
 */
export async function measureAction<T>(
  label: string,
  action: () => Promise<T>,
  maxMs: number = 5_000,
): Promise<{ result: T; ms: number; withinLimit: boolean }> {
  const start = Date.now();
  const result = await action();
  const ms = Date.now() - start;
  const withinLimit = ms <= maxMs;

  console.log(`[PERF] ${label}: ${ms}ms ${withinLimit ? "OK" : "SLOW (> " + maxMs + "ms)"}`);

  return { result, ms, withinLimit };
}

/**
 * Assert no blank page — check that main content is rendered.
 */
export async function assertNoBlankPage(page: Page, context: string) {
  const bodyText = await page.locator("body").innerText();
  const bodyHtml = await page.locator("body").innerHTML();

  // Blank = < 50 chars of visible text with no meaningful content
  const isBlank = bodyText.trim().length < 50 && !bodyHtml.includes("<main") && !bodyHtml.includes("<section");

  if (isBlank) {
    throw new Error(`[BUG] Blank page detected: ${context}`);
  }
}

/**
 * Assert no excessive delay — check that a visible element appears within time.
 */
export async function assertNoDelay(
  page: Page,
  selector: string,
  maxMs: number,
  context: string,
) {
  const start = Date.now();
  await page.locator(selector).waitFor({ state: "visible", timeout: maxMs });
  const ms = Date.now() - start;

  if (ms > maxMs) {
    throw new Error(`[BUG] Excessive delay (${ms}ms > ${maxMs}ms): ${context}`);
  }
}
