import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * These tests run against the full stack (Postgres + the app, in
 * LOCAL_MODE) started by `tilt up` (local) / `tilt ci` (CI) — see
 * docker-compose.yml, Tiltfile, and .github/workflows/e2e.yml. There's no
 * `webServer` here on purpose: Tilt already owns starting/stopping the app,
 * and having Playwright spawn a second one would fight over port 3000.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Every test hits the same LOCAL_MODE Postgres/blob volume and shells out
  // to the same `soffice` process for PDF conversion, so workers just
  // contend for the same CPU/DB rather than speeding anything up.
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  // docx -> PDF conversion shells out to LibreOffice (see src/lib/docx-to-pdf.ts)
  // and can take a while, especially on a cold/CI machine.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
