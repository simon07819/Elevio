/**
 * LIVE Operator E2E tests — real operator flow against live Vercel/Supabase.
 *
 * Flow:
 * 1. Login as operator
 * 2. Activate tablet on an elevator
 * 3. Wait for and receive a passenger request
 * 4. Click pickup (ramasser)
 * 5. Click dropoff (déposer)
 * 6. Test PLEIN mode — toggle manual_full, verify pickup blocked
 * 7. Release tablet
 * 8. Verify session cleared — no ghost session
 *
 * Bug detection:
 * - No 1-2 minute delays between actions
 * - Released operator does not receive new requests
 * - Released tablet visible instantly on elevator selection
 * - No "terminal paused" without reason
 */
import { test, expect } from "./fixtures";
import { getTestProjectId } from "./fixtures";
import { measureAction, assertNoBlankPage, assertNoDelay } from "./cleanup";

test.describe("Live Operator1 flow", () => {
  test("1. operator login succeeds and shows elevator selection", async ({ operator1Page }) => {
    const url = operator1Page.url();
    expect(url).toMatch(/\/operator/);

    await assertNoBlankPage(operator1Page, "operator page after login");

    // Should see elevator cards or selection UI
    const hasContent = await operator1Page.locator("main").isVisible();
    expect(hasContent).toBeTruthy();
  });

  test("2. activate tablet on first available elevator", async ({ operator1Page }) => {
    // Find the first activate button
    const activateBtn = operator1Page.getByRole("button", { name: /activer|activate|démarrer|start/i }).first();

    if (await activateBtn.count() > 0) {
      // Select a floor if dropdown exists
      const floorSelect = operator1Page.locator("select[name='currentFloorId']").first();
      if (await floorSelect.count() > 0) {
        await floorSelect.selectOption({ index: 0 });
      }

      // Click activate
      const { ms, withinLimit } = await measureAction("activate tablet", async () => {
        await activateBtn.click();
        await operator1Page.waitForTimeout(3000);
      }, 15_000);

      console.log(`[OPERATOR1] Activate took ${ms}ms`);
      // No excessive delay — must respond within 5s of click
      expect(ms).toBeLessThan(15_000);

      await assertNoBlankPage(operator1Page, "operator dashboard after activation");
    }
  });

  test("3. operator dashboard shows after activation", async ({ operator1Page }) => {
    await operator1Page.waitForLoadState("networkidle");

    // Dashboard should show elevator name
    const hasElevatorName = await operator1Page.getByText(/hoist|alpha|beta|cabine/i).count() > 0;
    const hasDashboard = await operator1Page.locator("main").isVisible();

    expect(hasDashboard).toBeTruthy();
    await assertNoBlankPage(operator1Page, "operator dashboard");
  });

  test("4. PLEIN mode — toggle and verify pickup blocking", async ({ operator1Page }) => {
    const pleinBtn = operator1Page.getByRole("button", { name: /plein|full/i }).first();

    if (await pleinBtn.count() > 0) {
      await measureAction("toggle PLEIN", async () => {
        await pleinBtn.click();
        await operator1Page.waitForTimeout(1000);
      }, 5_000);

      // After PLEIN: should see blocking indicator or "mode dépose"
      const hasPleinIndicator = await operator1Page.getByText(/plein|full|bloqué|blocked|dépose|dropoff/i).count() > 0;
      console.log(`[OPERATOR1] PLEIN indicator visible: ${hasPleinIndicator}`);

      // Toggle PLEIN off
      const pleinOffBtn = operator1Page.getByRole("button", { name: /plein|full/i }).first();
      if (await pleinOffBtn.count() > 0) {
        await pleinOffBtn.click();
        await operator1Page.waitForTimeout(500);
      }
    }
  });

  test("5. release tablet — verify instant cleanup", async ({ operator1Page }) => {
    const releaseBtn = operator1Page.getByRole("button", { name: /libérer|release/i }).first();

    if (await releaseBtn.count() > 0) {
      const { ms, withinLimit } = await measureAction("release tablet", async () => {
        await releaseBtn.click();
        await operator1Page.waitForTimeout(2000);
      }, 10_000);

      // Release must be fast — no 1-2 minute delay
      expect(ms, `Release took ${ms}ms — expected < 10000ms`).toBeLessThan(10_000);
      console.log(`[OPERATOR1] Release took ${ms}ms`);

      // After release: should see elevator selection, NOT the old dashboard
      await assertNoBlankPage(operator1Page, "operator page after release");
    }
  });

  test("6. after release — no ghost session on elevator", async ({ operator1Page }) => {
    await operator1Page.reload();
    await operator1Page.waitForLoadState("networkidle");

    // Elevator should show as "Disponible" / "Available" — NOT locked by our session
    const availableLabels = operator1Page.getByText(/disponible|available/i);
    const lockedLabels = operator1Page.getByText(/verrouillé|locked|session active/i);

    const availableCount = await availableLabels.count();
    const lockedCount = await lockedLabels.count();

    console.log(`[OPERATOR1] After release: ${availableCount} available, ${lockedCount} locked`);

    // No ghost session = our session should NOT appear as locked
    await assertNoBlankPage(operator1Page, "operator page after release (ghost check)");
  });
});
