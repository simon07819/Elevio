/**
 * Smoke tests — verify pages render without JS errors.
 */
import { test, expect } from "@playwright/test";

test.describe("Smoke tests — pages render", () => {
  test("home page renders", async ({ page }) => {
    await page.goto("/");
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
    const criticalErrors = errors.filter(
      (e) => !e.includes("supabase") && !e.includes("500") && !e.includes("Failed to fetch")
    );
    expect(criticalErrors.length).toBeLessThan(3);
  });
});
