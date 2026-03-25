import { expect, type Page, test } from "@playwright/test";

async function gotoLogin(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15_000 });
}

test.describe("Auth flow", () => {
  test("login page loads with sign-in buttons", async ({ page }) => {
    await gotoLogin(page);
    await expect(page.getByText("Sign in to Pub", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible({ timeout: 15_000 });
  });

  test("pubs page redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/pubs");
    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("agents page redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("settings page redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
