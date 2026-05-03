import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for LIVE E2E tests against real Vercel/Supabase.
 * No mocks. Uses .env.e2e for credentials and base URL.
 */
export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report-live" }],
    ["list"],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on",
    screenshot: "on",
    video: "on",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
