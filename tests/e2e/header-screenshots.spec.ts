import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = "tests/e2e/screenshots";

test.describe("Header screenshots", () => {
  test("tma state", async ({ page }) => {
    await page.goto("/debug/header");
    await expect(page.getByRole("heading", { name: "Header Debug" })).toBeVisible();
    await page.waitForTimeout(500);

    const section = page.getByTestId("batch-header-tma-state");
    await expect(section).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/header-tma-state.png` });
  });
});
