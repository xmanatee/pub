import { expect, test } from "@playwright/test";
import {
  ANIMATED_TOLERANCE,
  freezeAnimations,
  SCREENSHOT_DIR,
  stableScreenshot,
} from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 6000 } });

test.describe("Visual animation screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/visuals");
    await expect(page.getByRole("heading", { name: "Visuals Debug" })).toBeVisible();
    await freezeAnimations(page);
  });

  test("blob visual states", async ({ page }) => {
    const section = page.getByTestId("batch-visual-blob");
    await expect(section).toBeVisible();
    await page.waitForTimeout(2000);
    await stableScreenshot(section, `${SCREENSHOT_DIR}/visual-blob.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });
});
