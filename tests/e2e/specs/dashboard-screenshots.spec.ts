import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

test.describe("Dashboard screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard Debug" })).toBeVisible();
    await freezeAnimations(page);
  });

  test("pub cards", async ({ page }) => {
    const section = page.getByTestId("batch-dashboard-cards");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/dashboard-cards.png`);
  });

  test("live banners", async ({ page }) => {
    const section = page.getByTestId("batch-dashboard-live");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/dashboard-live.png`);
  });

  test("go live button", async ({ page }) => {
    const button = page.getByRole("button", { name: "Go live" });
    await expect(button).toBeVisible();
    await stableScreenshot(button, `${SCREENSHOT_DIR}/dashboard-go-live-button.png`);
  });

  test("full gallery with live", async ({ page }) => {
    const section = page.getByTestId("batch-dashboard-gallery");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/dashboard-gallery.png`);
  });
});
