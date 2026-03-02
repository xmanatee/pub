import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = "tests/e2e/screenshots";

test.use({ viewport: { width: 1280, height: 6000 } });

test.describe("Visual animation screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/visuals");
    await expect(page.getByRole("heading", { name: "Visuals Debug" })).toBeVisible();
  });

  test("aurora visual states", async ({ page }) => {
    const section = page.getByTestId("batch-visual-aurora");
    await expect(section).toBeVisible();
    await page.waitForTimeout(2000);
    await section.screenshot({ path: `${SCREENSHOT_DIR}/visual-aurora.png` });
  });

  test("orb visual states", async ({ page }) => {
    const section = page.getByTestId("batch-visual-orb");
    await expect(section).toBeVisible();
    await page.waitForTimeout(2000);
    await section.screenshot({ path: `${SCREENSHOT_DIR}/visual-orb.png` });
  });

  test("blob visual states", async ({ page }) => {
    const section = page.getByTestId("batch-visual-blob");
    await expect(section).toBeVisible();
    await page.waitForTimeout(2000);
    await section.screenshot({ path: `${SCREENSHOT_DIR}/visual-blob.png` });
  });
});
