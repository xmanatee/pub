import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = "tests/e2e/screenshots";

test.describe("Page screenshots", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Publish content/i })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/landing.png`, fullPage: true });
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to Pub")).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/login.png`, fullPage: true });
  });

  test("pub loading state", async ({ page }) => {
    await page.goto("/p/test-slug-nonexistent");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/pub-loading.png`, fullPage: true });
  });
});
