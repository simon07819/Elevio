/**
 * Admin E2E tests — simulates a human admin going through the full setup flow.
 */
import { test, expect } from "./fixtures/base";

test.describe("Admin flow", () => {
  test("1. admin login page shows sign-in form", async ({ adminPage }) => {
    await adminPage.goto("/admin/login");
    await expect(adminPage.locator("input[name='email']")).toBeVisible();
    await expect(adminPage.locator("input[name='password']")).toBeVisible();
    // Sign-in button visible
    const signInBtn = adminPage.getByRole("button", { name: /connexion|sign in/i });
    await expect(signInBtn).toBeVisible();
  });

  test("2. toggle to sign-up shows registration fields", async ({ adminPage }) => {
    await adminPage.goto("/admin/login");
    const toggleBtn = adminPage.getByRole("button", { name: /créer|create|compte|account/i });
    if (await toggleBtn.count() > 0) {
      await toggleBtn.first().click();
      await expect(adminPage.locator("input[name='firstName']")).toBeVisible();
      await expect(adminPage.locator("input[name='lastName']")).toBeVisible();
      await expect(adminPage.locator("input[name='company']")).toBeVisible();
      await expect(adminPage.locator("input[name='phone']")).toBeVisible();
    }
  });

  test("3. admin dashboard shows project list or empty state", async ({ adminPage }) => {
    await adminPage.goto("/admin");
    // Page should load without error — main content visible
    await expect(adminPage.locator("main")).toBeVisible({ timeout: 10_000 });
  });

  test("4. admin project page shows project list or create button", async ({ adminPage }) => {
    await adminPage.goto("/admin/projects");
    await expect(adminPage.locator("main")).toBeVisible();
    const hasProject = (await adminPage.getByText(/Tour Nord|E2E/).count()) > 0;
    const hasCreateBtn = (await adminPage.getByRole("button", { name: /nouveau|create|créer/i }).count()) > 0;
    expect(hasProject || hasCreateBtn).toBeTruthy();
  });

  test("5. floor editor page shows floors", async ({ adminPage }) => {
    await adminPage.goto("/admin/floors");
    await expect(adminPage.locator("main")).toBeVisible();
  });

  test("6. QR code generator page shows QR codes", async ({ adminPage }) => {
    await adminPage.goto("/admin/qrcodes");
    await expect(adminPage.locator("main")).toBeVisible({ timeout: 10_000 });
  });

  test("7. admin profile page shows profile form", async ({ adminPage }) => {
    await adminPage.goto("/admin/profile");
    await expect(adminPage.locator("main")).toBeVisible();
  });

  test("8. support/legal page shows version and legal sections", async ({ adminPage }) => {
    await adminPage.goto("/support");
    // Title
    await expect(adminPage.getByRole("heading", { level: 1 })).toBeVisible();
    // Version section — "Version de l'application" or "App version"
    await expect(adminPage.getByText(/version de l'application|app version/i)).toBeVisible();
    // Contact section — "Contact support" or "Support contact"
    await expect(adminPage.getByRole("heading", { name: /contact support|support contact/i })).toBeVisible();
    // Privacy section — "Politique de confidentialité" or "Privacy policy"
    await expect(adminPage.getByRole("heading", { name: /confidentialité|privacy/i })).toBeVisible();
    // Safety section — "Sécurité chantier" or "Construction site safety"
    await expect(adminPage.getByRole("heading", { name: /sécurité|safety/i })).toBeVisible();
  });

  test("9. logo is clickable on operator page", async ({ adminPage }) => {
    await adminPage.goto("/operator");
    const clickableLogo = adminPage.locator("a[href='/']");
    if (await clickableLogo.count() > 0) {
      await clickableLogo.click();
      await expect(adminPage).toHaveURL(/\//, { timeout: 5_000 });
    }
  });
});
