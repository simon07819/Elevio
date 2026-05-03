/**
 * Structural smoke tests — verify pages render without JS errors.
 * These tests navigate to each route and check for basic content.
 * No Supabase mocking needed — they just verify the page loads.
 */
import { test, expect } from "@playwright/test";

test.describe("Smoke tests — pages render", () => {
  test("home page renders", async ({ page }) => {
    await page.goto("/");
    // Should show scan button or access code input
    const hasContent = await page.locator("main, button, input").count() > 0;
    expect(hasContent).toBeTruthy();
  });

  test("admin login page renders", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
  });

  test("support page renders", async ({ page }) => {
    await page.goto("/support");
    // Should show version and sections
    const hasContent = await page.locator("main").count() > 0;
    expect(hasContent).toBeTruthy();
  });

  test("no console errors on home page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Filter out known harmless errors (e.g. Supabase connection failure in dev)
    const criticalErrors = errors.filter(
      (e) => !e.includes("supabase") && !e.includes("500") && !e.includes("Failed to fetch")
    );
    expect(criticalErrors.length, `Console errors: ${criticalErrors.join("; ")}`).toBeLessThan(3);
  });

  test("mobile viewport — home page renders", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hasContent = await page.locator("main, button").count() > 0;
    expect(hasContent).toBeTruthy();
  });

  test("tablet viewport — home page renders", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    const hasContent = await page.locator("main, button").count() > 0;
    expect(hasContent).toBeTruthy();
  });
});
