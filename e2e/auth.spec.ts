import { test, expect } from "@playwright/test";
import { login, signOut, LOCAL_EMAIL } from "./helpers";

test.describe("authentication", () => {
  test("signs in with the local demo account and back out again", async ({ page }) => {
    await login(page);
    await expect(page.getByText(LOCAL_EMAIL)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Docx Template → PDF" })).toBeVisible();

    await signOut(page);
    // Back on the landing page, signed out — its header calls the same link "Login".
    await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  });

  test("rejects the wrong password", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(LOCAL_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
