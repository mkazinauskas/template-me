import { test, expect, type Page } from "@playwright/test";
import { signOut, signUpNewUser, uniqueName, uploadExampleTemplate } from "./helpers";

/** Uploads the fixture and opens its "send" tab, where fill links are made. */
async function openSendTab(page: Page): Promise<string> {
  const templateUrl = await uploadExampleTemplate(page, uniqueName("Preset Template"));
  const sendUrl = `${templateUrl}/send`;
  await page.goto(sendUrl);
  return sendUrl;
}

async function openNewLinkDialog(page: Page) {
  await page.getByRole("button", { name: "New link" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // The preset list loads asynchronously; wait until it's settled.
  await expect(page.getByLabel("Preset", { exact: true })).toBeEnabled();
}

test.describe("fill link presets", () => {
  test("saves a preset, reuses it on a link, then edits and deletes it", async ({ page }) => {
    await signUpNewUser(page);
    const sendUrl = await openSendTab(page);
    const presetName = uniqueName("Onboarding");

    // Title and message are required before a link can be created.
    await openNewLinkDialog(page);
    const dialog = page.getByRole("dialog");
    const createLink = dialog.getByRole("button", { name: "Create link" });
    await expect(createLink).toBeDisabled();

    await dialog.getByLabel("Title", { exact: true }).fill("Welcome aboard");
    await dialog.getByLabel("Message", { exact: true }).fill("Please use your legal name.");
    await expect(createLink).toBeEnabled();

    // Save what's typed as a preset.
    await dialog.getByRole("button", { name: "Save as new" }).click();
    await dialog.getByLabel("New preset name").fill(presetName);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByLabel("Preset", { exact: true })).toHaveValue(/.+/);
    await expect(createLink).toBeVisible();

    // "Custom" clears the text; picking the preset fills it back in.
    await dialog.getByLabel("Preset", { exact: true }).selectOption({ label: "Custom" });
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Message", { exact: true })).toHaveValue("");
    await dialog.getByLabel("Preset", { exact: true }).selectOption({ label: presetName });
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Welcome aboard");

    // The preset survives a reload — it's stored server-side.
    await page.goto(sendUrl);
    await openNewLinkDialog(page);
    await page.getByLabel("Preset", { exact: true }).selectOption({ label: presetName });
    await page.getByRole("button", { name: "Create link" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The link carries the preset's text to whoever opens it.
    const linkPath = await page.locator("code").filter({ hasText: "/fill/" }).first().textContent();
    expect(linkPath).toMatch(/^\/fill\//);
    const recipient = await page.context().newPage();
    await recipient.goto(linkPath!);
    await expect(recipient.getByText("Welcome aboard")).toBeVisible();
    await expect(recipient.getByText("Please use your legal name.")).toBeVisible();
    await recipient.close();

    // Edit the preset from the manager.
    await openNewLinkDialog(page);
    await page.getByRole("button", { name: "Manage presets" }).click();
    const manager = page.getByRole("dialog");
    const row = manager.getByRole("listitem").filter({ hasText: presetName });
    await row.getByRole("button", { name: "Edit" }).click();
    await manager.getByLabel("Preset title").fill("Welcome to the team");
    await manager.getByRole("button", { name: "Save changes" }).click();
    await expect(row).toContainText("Welcome to the team");

    // Delete it with the inline confirm.
    await row.getByRole("button", { name: "Delete" }).click();
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect(manager.getByText(presetName)).toHaveCount(0);
    await expect(manager.getByText("No presets yet")).toBeVisible();

    // Gone after a reload too.
    await page.goto(sendUrl);
    await openNewLinkDialog(page);
    await expect(
      page.getByLabel("Preset", { exact: true }).locator("option", { hasText: presetName })
    ).toHaveCount(0);
  });

  test("presets are private to the user who made them", async ({ page }) => {
    await signUpNewUser(page);
    await openSendTab(page);
    const presetName = uniqueName("Private preset");

    await openNewLinkDialog(page);
    await page.getByRole("button", { name: "Manage presets" }).click();
    await page.getByRole("button", { name: "New preset" }).click();
    await page.getByLabel("Preset name").fill(presetName);
    await page.getByLabel("Preset title").fill("Secret title");
    await page.getByLabel("Preset message").fill("Secret message");
    await page.getByRole("button", { name: "Create preset" }).click();
    await expect(page.getByRole("dialog").getByText(presetName)).toBeVisible();

    await page.getByRole("button", { name: "Back to link" }).click();
    await page.keyboard.press("Escape");
    await signOut(page);

    await signUpNewUser(page);
    await openSendTab(page);
    await openNewLinkDialog(page);
    await expect(
      page.getByLabel("Preset", { exact: true }).locator("option", { hasText: presetName })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Manage presets" }).click();
    await expect(page.getByText("No presets yet")).toBeVisible();
  });
});
