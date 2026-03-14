import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

const PANEL_TOLERANCE = 0.003;

async function setupPage(page: import("@playwright/test").Page) {
  await page.goto("/debug/panels");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/debug\/panels(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Panels Debug" })).toBeVisible({
    timeout: 15_000,
  });
  await freezeAnimations(page);
}

test.describe("Panel screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
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
    await stableScreenshot(section, `${SCREENSHOT_DIR}/panels-tma.png`);
  });
});
