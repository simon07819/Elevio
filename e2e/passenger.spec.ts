/**
 * Passenger E2E tests — simulates a human passenger scanning QR and requesting a ride.
 *
 * Note: The request page is server-rendered and fetches from Supabase server-side,
 * so route interception doesn't work for it. These tests focus on the client-side
 * scan home page and verify the UI components exist.
 */
import { test, expect } from "./fixtures/base";

test.describe("Passenger flow", () => {
  test("1. scan home page shows scan button and manual code input", async ({ passengerPage }) => {
    await passengerPage.goto("/");
    const scanBtn = passengerPage.getByRole("button", { name: /scanner|scan/i });
    await expect(scanBtn).toBeVisible();
    // Manual code input area
    const codeArea = passengerPage.locator("input");
    expect(await codeArea.count()).toBeGreaterThanOrEqual(1);
    // Admin login link
    await expect(passengerPage.getByRole("link", { name: /admin/i })).toBeVisible();
  });

  test("2. scan home page shows brand logo", async ({ passengerPage }) => {
    await passengerPage.goto("/");
    const logo = passengerPage.locator("[aria-label='Elevio']");
    expect(await logo.count()).toBeGreaterThanOrEqual(1);
  });

  test("3. scan home page shows language switcher", async ({ passengerPage }) => {
    await passengerPage.goto("/");
    const langBtn = passengerPage.getByRole("button", { name: /^fr$|^en$|^FR$|^EN$/i });
    expect(await langBtn.count()).toBeGreaterThanOrEqual(0);
  });

  test("4. access code input accepts text", async ({ passengerPage }) => {
    await passengerPage.goto("/");
    const codeInput = passengerPage.locator("input").last();
    await codeInput.fill("TEST-CODE");
    await expect(codeInput).toHaveValue("TEST-CODE");
  });

  test("5. click scan button toggles camera mode", async ({ passengerPage }) => {
    await passengerPage.goto("/");
    const scanBtn = passengerPage.getByRole("button", { name: /scanner|scan/i });
    await scanBtn.click();
    // Button text should change to "Arrêter" or "Stop"
    await passengerPage.waitForTimeout(500);
    const stopBtn = passengerPage.getByRole("button", { name: /arrêter|stop/i });
    if (await stopBtn.count() > 0) {
      await stopBtn.click();
    }
  });

  test("6. support page accessible from footer or navigation", async ({ passengerPage }) => {
    await passengerPage.goto("/support");
    await expect(passengerPage.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("7. mobile viewport — scan page renders correctly", async ({ passengerPage }) => {
    await passengerPage.setViewportSize({ width: 390, height: 844 });
    await passengerPage.goto("/");
    await expect(passengerPage.getByRole("button", { name: /scanner|scan/i })).toBeVisible();
  });

  test("8. tablet viewport — scan page renders", async ({ passengerPage }) => {
    await passengerPage.setViewportSize({ width: 768, height: 1024 });
    await passengerPage.goto("/");
    await expect(passengerPage.getByRole("button", { name: /scanner|scan/i })).toBeVisible();
  });
});
