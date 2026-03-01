import { type Page, test } from "@playwright/test";

const MOBILE = { width: 430, height: 932 };
const DESKTOP = { width: 1280, height: 800 };

async function openDebugPage(page: Page) {
  await page.goto("/debug/control-bar");
  await page.getByRole("heading", { name: "Control Bar Debug" }).waitFor();
}

test.describe("Control bar collapse", () => {
  test("expanded state — mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openDebugPage(page);
    await page.screenshot({ path: "tests/e2e/screenshots/collapse-expanded-mobile.png" });
  });

  test("collapsed state — mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openDebugPage(page);
    await page.getByLabel("Hide control bar").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "tests/e2e/screenshots/collapse-collapsed-mobile.png" });
  });

  test("expanded state — desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openDebugPage(page);
    await page.screenshot({ path: "tests/e2e/screenshots/collapse-expanded-desktop.png" });
  });

  test("collapsed state — desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openDebugPage(page);
    await page.getByLabel("Hide control bar").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "tests/e2e/screenshots/collapse-collapsed-desktop.png" });
  });

  test("expanded with chat preview — mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openDebugPage(page);
    await page.getByRole("button", { name: "Show preview" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "tests/e2e/screenshots/collapse-preview-mobile.png" });
  });

  test("re-expand after collapse — mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openDebugPage(page);
    await page.getByLabel("Hide control bar").click();
    await page.waitForTimeout(400);
    await page.getByLabel("Show control bar").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "tests/e2e/screenshots/collapse-reexpanded-mobile.png" });
  });
});
