import { expect, test } from "@playwright/test";
import {
  freezeAnimations,
  openDebugPage,
  SCREENSHOT_DIR,
  stableScreenshot,
} from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

test.describe("Onboarding screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await openDebugPage(page, "/debug/onboarding", "Onboarding Debug");
    await freezeAnimations(page);
  });

  test("all onboarding states", async ({ page }) => {
    const section = page.getByTestId("batch-onboarding-states");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/onboarding-states.png`);
  });
});
