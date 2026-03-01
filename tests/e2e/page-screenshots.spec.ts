import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = "tests/e2e/screenshots";

test.use({ reducedMotion: "reduce" });

test.describe("Page screenshots", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Publish content/i })).toBeVisible();
    // html has overflow:hidden + height:100% (TMA viewport hardening), so body
    // scrolls internally and fullPage:true only captures the viewport-sized html.
    // Temporarily remove the constraint so Playwright can measure the full document.
    await page.evaluate(() => {
      document.documentElement.style.overflow = "visible";
      document.documentElement.style.height = "auto";
    });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/landing.png`, fullPage: true });
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to Pub")).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login.png`, fullPage: true });
  });

  test("pub loading state", async ({ page }) => {
    await page.goto("/p/test-slug-nonexistent");

    await page.screenshot({ path: `${SCREENSHOT_DIR}/pub-loading.png`, fullPage: true });
  });
});
