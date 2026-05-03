import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { loginAdmin, loginOperator1, loginOperator2, logoutAdmin } from "./auth";
import { cleanupTestProjects } from "./cleanup";

/**
 * Live E2E fixtures — real browser sessions with real auth.
 * No Supabase mocking.
 */

type LiveFixtures = {
  adminPage: Page;
  passengerPage: Page;
  operator1Page: Page;
  operator2Page: Page;
};

export const test = base.extend<LiveFixtures>({
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAdmin(page);
    await use(page);
    await logoutAdmin(page);
    await context.close();
  },
  passengerPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Passenger is unauthenticated — just load the page
    await use(page);
    await context.close();
  },
  operator1Page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginOperator1(page);
    await use(page);
    await context.close();
  },
  operator2Page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginOperator2(page);
    await use(page);
    await context.close();
  },
});

export { expect };

// Shared test project ID — set during admin setup, used by all other suites
let _testProjectId: string | null = null;
let _testFloorIds: string[] = [];
let _testElevatorIds: string[] = [];

export function setTestProjectId(id: string) { _testProjectId = id; }
export function getTestProjectId(): string { return _testProjectId!; }
export function setTestFloorIds(ids: string[]) { _testFloorIds = ids; }
export function getTestFloorIds(): string[] { return _testFloorIds; }
export function setTestElevatorIds(ids: string[]) { _testElevatorIds = ids; }
export function getTestElevatorIds(): string[] { return _testElevatorIds; }

/**
 * Run cleanup in afterAll for any test suite that created data.
 */
export async function liveAfterAll(adminPage: Page) {
  try {
    await cleanupTestProjects(adminPage);
  } catch (e) {
    console.error("[CLEANUP] Failed:", e);
  }
}
