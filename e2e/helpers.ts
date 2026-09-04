import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Matches .env.docker's LOCAL_AUTH_EMAIL/LOCAL_AUTH_PASSWORD, seeded by
 * scripts/seed-local-user.ts (run by the `migrate` service in
 * docker-compose.yml before `app` starts). Overridable in case a stack sets
 * different local credentials.
 */
export const LOCAL_EMAIL = process.env.PLAYWRIGHT_LOCAL_AUTH_EMAIL ?? "demo@example.com";
export const LOCAL_PASSWORD = process.env.PLAYWRIGHT_LOCAL_AUTH_PASSWORD ?? "localpassword123";

/** The bundled fixture (fields documented in src/lib/docx-template.extract-fields.test.ts). */
export const EXAMPLE_TEMPLATE_PATH = path.join(__dirname, "..", "public", "example-template.docx");

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Signs in through the local-mode email/password form — the sign-in page
 * only renders this form when NEXT_PUBLIC_LOCAL_MODE=true (see
 * src/components/auth-form.tsx and local-auth-form.tsx), which is how the
 * Tilt/Docker Compose stack these tests run against is configured.
 */
export async function login(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(LOCAL_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/client\/dashboard$/);
}

/**
 * Opens the account menu (see AppHeader) and signs out. Scoped to `<header>`
 * because Next dev tools' own toggle button also carries
 * `aria-haspopup="menu"` and would otherwise match too.
 */
export async function signOut(page: Page) {
  await page.locator("header").locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/**
 * Creates and signs in as a brand-new account via the local-mode sign-up
 * form, rather than reusing the shared seeded demo account. The
 * /api/templates/[id]/generate route rate-limits document generation per
 * user id (see its RATE_LIMIT_MAX_USER — 10 requests/60s, and every preview
 * re-render while filling a form counts against it); most specs fill and
 * download templates, so a fresh account per test keeps each test's usage
 * under its own limit instead of all tests fighting over one shared bucket.
 */
export async function signUpNewUser(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/client\/dashboard$/);
  return email;
}

/**
 * Uploads the example .docx fixture under a unique name via the dashboard's
 * upload form, waits for it to land on its detail/fill page, and returns
 * that page's URL (without the `?warnings=` query string).
 */
export async function uploadExampleTemplate(page: Page, name: string): Promise<string> {
  await page.goto("/client/dashboard");
  await page.getByLabel("Template name (optional)").fill(name);
  await page.getByLabel("Word document (.docx)").setInputFiles(EXAMPLE_TEMPLATE_PATH);
  await page.getByRole("button", { name: "Upload template" }).click();
  await expect(page).toHaveURL(/\/client\/dashboard\/templates\/[^/?]+/);
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  return page.url().split("?")[0];
}

/**
 * Fills every field of the example-template fixture with sample values.
 * Field ids/types/params come from src/lib/docx-template.extract-fields.test.ts:
 * full_name (string), salary (number), start_date (date),
 * relocation (boolean, Yes/No), employment_type (select, Full-time/Part-time/Contract),
 * terms_accepted (checkbox).
 */
export async function fillExampleFields(page: Page) {
  await page.locator("#full_name").fill("Ada Lovelace");
  await page.locator("#salary").fill("95000");
  await page.locator("#start_date").fill("2026-10-01");

  const relocationToggle = page.locator("#relocation");
  if ((await relocationToggle.getAttribute("aria-checked")) !== "true") {
    await relocationToggle.click();
  }
  await expect(relocationToggle).toHaveAttribute("aria-checked", "true");

  await page.locator("#employment_type").selectOption("Full-time");
  await page.locator("#terms_accepted").check();
}
