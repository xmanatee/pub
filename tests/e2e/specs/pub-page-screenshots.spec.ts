import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

test.describe("Pub page screenshots", () => {
  test("pub page states", async ({ page }) => {
    await page.goto("/debug/pub-page");
    await expect(page.getByRole("heading", { name: "Pub Page Debug" })).toBeVisible();
    await freezeAnimations(page);
    const section = page.getByTestId("batch-pub-page-states");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/pub-page-states.png`);
  });

  test("offline mode", async ({ page }) => {
    await page.goto("/debug/pub-page");
    await expect(page.getByRole("heading", { name: "Pub Page Debug" })).toBeVisible();
    await freezeAnimations(page);
    const section = page.getByTestId("batch-offline-mode");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/offline-mode.png`);
  });
});
