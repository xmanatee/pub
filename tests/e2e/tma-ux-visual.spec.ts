import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "screenshots");

test.use({ viewport: { width: 393, height: 852 } });

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe("TMA UX visual snapshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/tma-ux");
    await expect(page.getByRole("heading", { name: "TMA UX Debug" })).toBeVisible();
  });

  test("header: non-TMA", async ({ page }) => {
    const section = page.getByTestId("header-non-tma");
    await expect(section).toBeVisible();
    await section.screenshot({ path: path.join(SCREENSHOT_DIR, "header-non-tma.png") });
  });

  test("header: fullscreen TMA", async ({ page }) => {
    const section = page.getByTestId("header-fullscreen-tma");
    await expect(section).toBeVisible();
    await section.screenshot({ path: path.join(SCREENSHOT_DIR, "header-fullscreen-tma.png") });
  });

  test("header: non-fullscreen TMA", async ({ page }) => {
    const section = page.getByTestId("header-non-fullscreen-tma");
    await expect(section).toBeVisible();
    await section.screenshot({
      path: path.join(SCREENSHOT_DIR, "header-non-fullscreen-tma.png"),
    });
  });

  test("control bar: with Close button", async ({ page }) => {
    const section = page.getByTestId("control-bar-with-close");
    await expect(section).toBeVisible();

    // Right-click the message input within this section to expand extended options
    await section.getByLabel("Message").click({ button: "right" });
    await expect(section.getByRole("menuitem", { name: "Close" })).toBeVisible();

    await section.screenshot({ path: path.join(SCREENSHOT_DIR, "control-bar-with-close.png") });
  });

  test("control bar: idle", async ({ page }) => {
    const section = page.getByTestId("control-bar-idle");
    await expect(section).toBeVisible();
    await section.screenshot({ path: path.join(SCREENSHOT_DIR, "control-bar-idle.png") });
  });
});
