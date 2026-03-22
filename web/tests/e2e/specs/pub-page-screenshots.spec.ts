import { expect, test } from "@playwright/test";
import {
  freezeAnimations,
  openDebugPage,
  SCREENSHOT_DIR,
  stableScreenshot,
} from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

test.describe("Pub page screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await openDebugPage(page, "/debug/pub-page", "Pub Page Debug");
    await freezeAnimations(page);
  });

  test("pub page states", async ({ page }) => {
    const section = page.getByTestId("batch-pub-page-states");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/pub-page-states.png`);
  });

  test("offline mode", async ({ page }) => {
    const section = page.getByTestId("batch-offline-mode");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/offline-mode.png`);
  });
});
