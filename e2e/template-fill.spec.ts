import { test, expect } from "@playwright/test";
import { signUpNewUser, uploadExampleTemplate, fillExampleFields, uniqueName } from "./helpers";

test.describe("upload and fill a template", () => {
  test.beforeEach(async ({ page }) => {
    await signUpNewUser(page);
  });

  test("uploads a .docx, extracts fields cleanly, and shows it in the list", async ({ page }) => {
    const name = uniqueName("Offer Letter");
    await uploadExampleTemplate(page, name);

    // example-template.docx parses with zero warnings (see
    // src/lib/docx-template.extract-fields.test.ts) — the warnings banner
    // must not appear.
    await expect(page.getByText("Some tags weren't fully understood")).toHaveCount(0);

    // Every extracted field renders an input.
    await expect(page.locator("#full_name")).toBeVisible();
    await expect(page.locator("#salary")).toBeVisible();
    await expect(page.locator("#start_date")).toBeVisible();
    await expect(page.locator("#relocation")).toBeVisible();
    await expect(page.locator("#employment_type")).toBeVisible();
    await expect(page.locator("#terms_accepted")).toBeVisible();

    await page.goto("/client/dashboard/templates");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("fills the form and downloads a generated PDF", async ({ page }) => {
    const name = uniqueName("Employment Contract");
    await uploadExampleTemplate(page, name);
    await fillExampleFields(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("fills the form and downloads a generated Word document", async ({ page }) => {
    const name = uniqueName("Employment Contract Docx");
    await uploadExampleTemplate(page, name);
    await fillExampleFields(page);

    await page.getByLabel("Download format").selectOption("docx");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download DOCX" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.docx$/i);
  });

  test("blocks submission until required fields are filled", async ({ page }) => {
    const name = uniqueName("Incomplete Form");
    await uploadExampleTemplate(page, name);

    // Required text/number/date/select inputs use native HTML validation;
    // submitting a blank required field keeps the browser on the page
    // instead of firing the fetch to /generate.
    await page.getByRole("button", { name: "Download PDF" }).click();
    await expect(page.locator("#full_name:invalid")).toHaveCount(1);
  });
});
