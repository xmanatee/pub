import { expect, test } from "@playwright/test";
import {
  ANIMATED_TOLERANCE,
  freezeAnimations,
  openDebugPage,
  SCREENSHOT_DIR,
  stableScreenshot,
} from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

test.describe("Pubs screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await openDebugPage(page, "/debug/pubs", "Pubs Debug");
    await freezeAnimations(page);
  });

  test("nav preview", async ({ page }) => {
    const section = page.getByTestId("batch-pubs-nav");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/pubs-nav.png`);
  });

  test("pub cards", async ({ page }) => {
    const section = page.getByTestId("batch-pubs-cards");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/pubs-cards.png`);
  });

  test("go live button", async ({ page }) => {
    const button = page.getByRole("button", { name: "Go live" });
    await expect(button).toBeVisible();
    await stableScreenshot(button, `${SCREENSHOT_DIR}/pubs-go-live-button.png`);
  });

  test("full gallery with live", async ({ page }) => {
    const section = page.getByTestId("batch-pubs-gallery");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/pubs-gallery.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });
});
