import { expect, test } from "@playwright/test";
import {
  ANIMATED_TOLERANCE,
  freezeAnimations,
  openDebugPage,
  SCREENSHOT_DIR,
  stableScreenshot,
} from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 6000 } });

test.describe("Blob animation screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await openDebugPage(page, "/debug/blob", "Blob Debug");
    await freezeAnimations(page);
  });

  test("blob states", async ({ page }) => {
    const section = page.getByTestId("batch-blob-state");
    await expect(section).toBeVisible();
    await page.waitForTimeout(2000);
    await stableScreenshot(section, `${SCREENSHOT_DIR}/blob-state.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });
});
