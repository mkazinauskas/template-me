import { test, expect } from "@playwright/test";
import { signUpNewUser, uploadExampleTemplate, uniqueName } from "./helpers";

const CSV_ROWS = [
  "full_name,salary,start_date,relocation,employment_type,terms_accepted",
  "Grace Hopper,120000,2026-11-15,yes,Full-time,yes",
  "Alan Turing,110000,2026-12-01,no,Contract,yes",
].join("\n");

test.describe("bulk-fill from a spreadsheet", () => {
  test.beforeEach(async ({ page }) => {
    await signUpNewUser(page);
  });

  test("uploads a CSV, auto-maps columns, and generates a zip of documents", async ({ page }) => {
    const name = uniqueName("Bulk Offer Letter");
    await uploadExampleTemplate(page, name);

    await page.getByRole("button", { name: "Create multiple from a spreadsheet" }).click();

    await page
      .getByLabel(/Spreadsheet \(\.csv/)
      .setInputFiles({ name: "rows.csv", mimeType: "text/csv", buffer: Buffer.from(CSV_ROWS) });

    await expect(page.getByText("rows.csv — 2 rows")).toBeVisible();

    // Headers match the field keys exactly, so autoMapFieldsToHeaders (see
    // src/components/bulk-fill/row-helpers.ts) should map every column
    // without any manual mapping — no "not mapped" warning.
    await expect(page.getByText(/Not mapped:/)).toHaveCount(0);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Generate 2 documents" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });

  test("previews a single row before generating the batch", async ({ page }) => {
    const name = uniqueName("Bulk Preview");
    await uploadExampleTemplate(page, name);
    await page.getByRole("button", { name: "Create multiple from a spreadsheet" }).click();

    await page
      .getByLabel(/Spreadsheet \(\.csv/)
      .setInputFiles({ name: "rows.csv", mimeType: "text/csv", buffer: Buffer.from(CSV_ROWS) });

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByTitle("Document preview")).toBeVisible({ timeout: 30_000 });
  });
});
