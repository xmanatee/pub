import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = "tests/e2e/screenshots";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 4000 } });

test.describe("Pub page screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/pub-page");
    await expect(page.getByRole("heading", { name: "Pub Page Debug" })).toBeVisible();
  });

  test("pub page states", async ({ page }) => {
    const section = page.getByTestId("batch-pub-page-states");
    await expect(section).toBeVisible();
    await section.screenshot({ path: `${SCREENSHOT_DIR}/pub-page-states.png` });
  });
});
