import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "../helpers/screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

test.describe("Header screenshots", () => {
  test("tma state", async ({ page }) => {
    await page.goto("/debug/header");
    await expect(page.getByRole("heading", { name: "Header Debug" })).toBeVisible();
    await freezeAnimations(page);
    const section = page.getByTestId("batch-header-tma-state");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/header-tma-state.png`);
  });
});
