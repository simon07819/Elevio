import type { Page } from "@playwright/test";

/**
 * Real auth helpers — log in via the Elevio admin login form.
 * No mocking. Uses real Supabase auth.
 */

export async function loginAdmin(page: Page) {
  const email = process.env.E2E_ADMIN_EMAIL!;
  const password = process.env.E2E_ADMIN_PASSWORD!;
  await loginViaForm(page, email, password);
}

export async function loginOperator1(page: Page) {
  const email = process.env.E2E_OPERATOR1_EMAIL!;
  const password = process.env.E2E_OPERATOR_PASSWORD!;
  await loginViaForm(page, email, password);
}

export async function loginOperator2(page: Page) {
  const email = process.env.E2E_OPERATOR2_EMAIL!;
  const password = process.env.E2E_OPERATOR_PASSWORD!;
  await loginViaForm(page, email, password);
}

async function loginViaForm(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");

  // Fill email
  await page.locator("input[name='email']").fill(email);
  // Fill password
  await page.locator("input[name='password']").fill(password);
  // Click sign in
  const signInBtn = page.getByRole("button", { name: /connexion|sign in/i });
  await signInBtn.click();

  // Wait for redirect to admin or operator page
  await page.waitForURL(/\/(admin|operator)/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

/**
 * Sign out via the admin sign-out action.
 */
export async function logoutAdmin(page: Page) {
  // Find sign-out button in admin shell navigation
  const signOutBtn = page.getByRole("button", { name: /déconnexion|sign out|logout/i });
  if (await signOutBtn.count() > 0) {
    await signOutBtn.click();
    await page.waitForURL(/\//, { timeout: 10_000 });
  }
}
