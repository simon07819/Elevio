import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: process.env.ELEVIO_BASE_URL || "http://localhost:3000",
    headless: true,
    screenshot: "on",
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  projects: [
    { name: "button-audit", testMatch: "button-audit.spec.ts" },
    { name: "chaos", testMatch: "chaos-scenarios.spec.ts" },
    { name: "50-scenarios", testMatch: "50-scenarios.spec.ts" },
    { name: "stress-crossing", testMatch: "stress-crossing-50.spec.ts" },
    { name: "pickup-qr-return", testMatch: "pickup-qr-return.spec.ts" },
    { name: "operator-real-flow", testMatch: "operator-real-flow.spec.ts" },
    { name: "full-live-regression", testMatch: "full-live-regression.spec.ts" },
    // ── LIVE QA ──
    { name: "qa-operator", testMatch: "qa-operator-scenarios.spec.ts" },
    { name: "qa-passenger", testMatch: "qa-passenger-scenarios.spec.ts" },
    { name: "qa-billing", testMatch: "qa-billing-auth-scenarios.spec.ts" },
    { name: "qa-stress", testMatch: "qa-stress-testing.spec.ts" },
  ],
});
