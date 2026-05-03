import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
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
  ],
});
