import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = "tests/e2e/screenshots";

test.use({ reducedMotion: "reduce" });

test.describe("Control bar screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/control-bar");
    await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible();
  });

  test("visual states", async ({ page }) => {
    const section = page.getByTestId("batch-visual-state");
    await expect(section).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/control-bar-visual-state.png` });
  });

  test("collapsed", async ({ page }) => {
    const section = page.getByTestId("batch-collapsed");
    await expect(section).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/control-bar-collapsed.png` });
  });

  test("chat preview", async ({ page }) => {
    const section = page.getByTestId("batch-preview");
    await expect(section).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/control-bar-preview.png` });
  });

  test("close button", async ({ page }) => {
    const section = page.getByTestId("batch-close-button");
    await expect(section).toBeVisible();

    const withClose = section.locator('[class*="border"]:has([class*="bg-muted"])').last();
    await withClose.getByLabel("Message").click({ button: "right" });
    await expect(section.getByRole("menuitem", { name: "Close" })).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/control-bar-close-button.png` });
  });
});
