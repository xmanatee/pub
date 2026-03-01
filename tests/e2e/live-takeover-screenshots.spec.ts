import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = "tests/e2e/screenshots";

test.use({ reducedMotion: "reduce" });

test.describe("Live takeover screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/live-takeover");
    await expect(page.getByRole("heading", { name: "Live Takeover Debug" })).toBeVisible();
  });

  test("takeover prompt", async ({ page }) => {
    const section = page.getByTestId("batch-takeover-prompt");
    await expect(section).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/live-takeover-prompt.png` });
  });

  test("taken over banner", async ({ page }) => {
    const section = page.getByTestId("batch-taken-over-banner");
    await expect(section).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/live-taken-over-banner.png` });
  });
});
