import { test, expect } from "@playwright/test";
import { signUpNewUser, uploadExampleTemplate, fillExampleFields, uniqueName } from "./helpers";

test.describe("publishing and deleting a template", () => {
  test("a published template is visible and fillable to a signed-out visitor", async ({
    page,
    browser,
  }) => {
    await signUpNewUser(page);
    const name = uniqueName("Public Template");
    const clientUrl = await uploadExampleTemplate(page, name);
    const templateId = clientUrl.split("/").pop();
    // Anonymous visitors can't use the owner's /client/dashboard/... route
    // (proxy.ts gates all of /client/* behind a session) — they reach a
    // public template through /public/templates/[id] instead.
    const publicUrl = `/public/templates/${templateId}`;

    await page.getByRole("switch", { name: "Make template public" }).click();
    await page.getByRole("button", { name: "Confirm — make public" }).click();
    await expect(page.getByRole("switch", { name: "Make template public" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    // It also shows up in the public browse list, logged out.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto("/public/templates");
      await expect(anonPage.getByText(name)).toBeVisible();

      await anonPage.goto(publicUrl);
      await expect(anonPage.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
      await expect(anonPage.getByText("Public template", { exact: true })).toBeVisible();
      // No owner controls for an anonymous visitor.
      await expect(anonPage.getByRole("switch", { name: "Make template public" })).toHaveCount(0);

      await fillExampleFields(anonPage);
      const downloadPromise = anonPage.waitForEvent("download");
      await anonPage.getByRole("button", { name: "Download PDF" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    } finally {
      await anonContext.close();
    }
  });

  test("deleting a template removes it from the list", async ({ page }) => {
    await signUpNewUser(page);
    const name = uniqueName("Template To Delete");
    await uploadExampleTemplate(page, name);

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();

    await expect(page).toHaveURL(/\/client\/dashboard\/templates$/);
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
