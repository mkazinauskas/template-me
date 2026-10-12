import { test, expect, type Page } from "@playwright/test";
import { signUpNewUser, uniqueName, uploadExampleTemplate } from "./helpers";

/** Uploads the fixture and opens its "send" tab, where fill links are made. */
async function openSendTab(page: Page) {
  const templateUrl = await uploadExampleTemplate(page, uniqueName("Edit Link Template"));
  await page.goto(`${templateUrl}/send`);
}

test.describe("editing a fill link", () => {
  test("changes an unfilled link's ask without changing its URL", async ({ page }) => {
    await signUpNewUser(page);
    await openSendTab(page);

    await page.getByRole("button", { name: "New link" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title", { exact: true }).fill("First title");
    await dialog.getByLabel("Message", { exact: true }).fill("First message");
    await dialog.getByRole("button", { name: "Create link" }).click();
    await expect(dialog).toHaveCount(0);

    const linkPath = await page.locator("code").filter({ hasText: "/fill/" }).first().textContent();
    expect(linkPath).toMatch(/^\/fill\//);

    // Edit opens with the link's current values.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Edit fill link" })).toBeVisible();
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("First title");
    await dialog.getByLabel("Title", { exact: true }).fill("Second title");
    await dialog.getByLabel("Message", { exact: true }).fill("Second message");
    await dialog.getByRole("button", { name: "Clear all" }).click();
    await dialog.getByRole("checkbox", { name: /full name/i }).check();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByText("Second title")).toBeVisible();
    await expect(page.getByText(/asks for 1 of/i)).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "/fill/" }).first()).toHaveText(linkPath!);

    // The recipient sees the edited ask on the same URL.
    const recipient = await page.context().newPage();
    await recipient.goto(linkPath!);
    await expect(recipient.getByText("Second title")).toBeVisible();
    await expect(recipient.getByText("Second message")).toBeVisible();
    await expect(recipient.locator("#full_name")).toBeVisible();
    await expect(recipient.locator("#salary")).toHaveCount(0);
    await recipient.close();
  });
});
