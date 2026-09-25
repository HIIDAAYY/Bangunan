import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_PASSWORD = "e2e-rahasia";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // tes berbagi satu database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    httpCredentials: { username: "admin", password: E2E_PASSWORD },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? `npx next start -p ${PORT}` : `npx next dev --turbopack -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DASHBOARD_PASSWORD: E2E_PASSWORD,
      // Simulator memakai extractor heuristik agar E2E tidak memanggil Claude.
      EXTRACTOR: "heuristik",
      APP_SECRET: process.env.APP_SECRET ?? "e2e-secret",
      PUBLIC_BASE_URL: `http://localhost:${PORT}`,
    },
  },
});
