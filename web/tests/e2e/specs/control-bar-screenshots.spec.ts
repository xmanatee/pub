import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  ANIMATED_TOLERANCE,
  freezeAnimations,
  SCREENSHOT_DIR,
  stableScreenshot,
} from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

async function setupPage(page: Page) {
  await page.goto("/debug/control-bar");
  await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible();
  await freezeAnimations(page);
}

test.describe("Control bar screenshots", () => {
  test("blob states", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-blob-state");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/control-bar-blob-state.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });

  test("collapsed mobile", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-collapsed-mobile");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/control-bar-collapsed-mobile.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });

  test("collapsed desktop", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-collapsed-desktop");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/control-bar-collapsed-desktop.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });

  test("modes: normal, preview", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-preview");
    await expect(section).toBeVisible();
    await page.waitForTimeout(600);
    await stableScreenshot(section, `${SCREENSHOT_DIR}/control-bar-preview.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });

  test("takeover", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2025-01-01T00:00:00Z"));
    await setupPage(page);
    const section = page.getByTestId("batch-takeover");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/control-bar-takeover.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });

  test("multiline input", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-multiline");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/control-bar-multiline.png`, {
      maxDiffRatio: ANIMATED_TOLERANCE,
    });
  });
});
