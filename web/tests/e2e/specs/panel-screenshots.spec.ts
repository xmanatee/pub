import { expect, test } from "@playwright/test";
import {
  freezeAnimations,
  openDebugPage,
  SCREENSHOT_DIR,
  stableScreenshot,
} from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

const PANEL_TOLERANCE = 0.003;

test.describe("Panel screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await openDebugPage(page, "/debug/panels", "Panels Debug");
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
