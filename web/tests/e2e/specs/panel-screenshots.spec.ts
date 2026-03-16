import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

const PANEL_TOLERANCE = 0.003;

test.describe("Panel screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/panels");
    await expect(page.getByRole("heading", { name: "Panels Debug" })).toBeVisible();
    await freezeAnimations(page);
  });

  test("default", async ({ page }) => {
    const section = page.getByTestId("batch-panels-default");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/panels-default.png`, {
      maxDiffRatio: PANEL_TOLERANCE,
    });
  });

  test("tma fullscreen", async ({ page }) => {
    const section = page.getByTestId("batch-panels-tma");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/panels-tma.png`, {
      maxDiffRatio: PANEL_TOLERANCE,
    });
  });
});
