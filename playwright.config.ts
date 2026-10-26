import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: process.env.E2E_PRODUCTION === "1" ? 90000 : 180000,
  expect: { timeout: process.env.E2E_PRODUCTION === "1" ? 15000 : 45000 },
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
