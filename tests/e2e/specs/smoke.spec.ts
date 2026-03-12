import { expect, test } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("landing page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/pub/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/login/);
    expect(page.url()).toContain("/login");
  });

  test("login page shows OAuth buttons", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /github/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("explore page is publicly accessible", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.locator("body")).toBeVisible();
  });
});
