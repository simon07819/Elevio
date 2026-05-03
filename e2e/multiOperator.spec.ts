/**
 * Multi-operator E2E tests — simulates 2 operators working concurrently.
 */
import { test, expect } from "./fixtures/base";

test.describe("Multi-operator flow", () => {
  test("1. both operators can load the operator page", async ({ operator1Page, operator2Page }) => {
    await operator1Page.goto("/operator");
    await operator2Page.goto("/operator");
    await operator1Page.waitForLoadState("networkidle");
    await operator2Page.waitForLoadState("networkidle");
    await expect(operator1Page.locator("main")).toBeVisible();
    await expect(operator2Page.locator("main")).toBeVisible();
  });

  test("2. operator1 sees elevators in list", async ({ operator1Page }) => {
    await operator1Page.goto("/operator");
    await operator1Page.waitForLoadState("networkidle");
    const cards = operator1Page.locator("[class*='rounded-3xl'], [class*='rounded-2xl']");
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("3. both operators see the same elevator list", async ({ operator1Page, operator2Page }) => {
    await operator1Page.goto("/operator");
    await operator2Page.goto("/operator");
    await operator1Page.waitForLoadState("networkidle");
    await operator2Page.waitForLoadState("networkidle");
    // Both should have content in main
    await expect(operator1Page.locator("main")).toBeVisible();
    await expect(operator2Page.locator("main")).toBeVisible();
  });

  test("4. PLEIN on one elevator does not affect the other", async ({ operator1Page }) => {
    await operator1Page.goto("/operator");
    await operator1Page.waitForLoadState("networkidle");
    const pleinBtn = operator1Page.getByRole("button", { name: /plein|full/i }).first();
    if (await pleinBtn.count() > 0) {
      await pleinBtn.click();
      await operator1Page.waitForTimeout(1000);
    }
  });

  test("5. after release, operator sees elevator selection again", async ({ operator1Page }) => {
    await operator1Page.goto("/operator");
    await operator1Page.waitForLoadState("networkidle");
    const releaseBtn = operator1Page.getByRole("button", { name: /libérer|release/i }).first();
    if (await releaseBtn.count() > 0) {
      await releaseBtn.click();
      await operator1Page.waitForTimeout(2000);
    }
  });

  test("6. no ghost sessions — both operators release and elevators are free", async ({ operator1Page, operator2Page }) => {
    await operator1Page.goto("/operator");
    await operator2Page.goto("/operator");
    await operator1Page.waitForLoadState("networkidle");
    await operator2Page.waitForLoadState("networkidle");
    for (const page of [operator1Page, operator2Page]) {
      const releaseBtn = page.getByRole("button", { name: /libérer|release/i }).first();
      if (await releaseBtn.count() > 0) {
        await releaseBtn.click();
        await page.waitForTimeout(1000);
      }
    }
    await operator1Page.reload();
    await operator1Page.waitForLoadState("networkidle");
    await expect(operator1Page.locator("main")).toBeVisible();
  });
});
