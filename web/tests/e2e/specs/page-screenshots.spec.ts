import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "../helpers/screenshot-utils";

const LANDING_PAGE_TOLERANCE = 0.01;

async function gotoLanding(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/(?:\?.*)?$/, { timeout: 15_000 });
}

test.use({ reducedMotion: "reduce" });

test.describe("Page screenshots", () => {
  test("landing page", async ({ page }) => {
    await gotoLanding(page);
    await expect(page.getByRole("heading", { name: "One app to rule them all." })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Examples that make it click" })).toBeVisible();
    await freezeAnimations(page);
    // html has overflow:hidden + height:100% (TMA viewport hardening), so body
    // scrolls internally and fullPage:true only captures the viewport-sized html.
    // Temporarily remove the constraint so Playwright can measure the full document.
    await page.evaluate(() => {
      document.documentElement.style.overflow = "visible";
      document.documentElement.style.height = "auto";
    });
    await stableScreenshot(page, `${SCREENSHOT_DIR}/landing.png`, {
      fullPage: true,
      maxDiffRatio: LANDING_PAGE_TOLERANCE,
    });
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to Pub")).toBeVisible();
    await freezeAnimations(page);
    await stableScreenshot(page, `${SCREENSHOT_DIR}/login.png`, { fullPage: true });
  });
});
