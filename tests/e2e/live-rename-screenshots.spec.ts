import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCREENSHOTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "screenshots");
const shot = (name: string) => join(SCREENSHOTS_DIR, `${name}.png`);

test.beforeAll(() => {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

test.describe("live-rename visual snapshots", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Publish content/i })).toBeVisible();
    await page.screenshot({ path: shot("landing"), fullPage: true });
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to Pub")).toBeVisible();
    await page.screenshot({ path: shot("login"), fullPage: true });
  });

  test("control bar — idle", async ({ page }) => {
    await page.goto("/debug/control-bar");
    await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("cb-idle"), fullPage: true });
  });

  test("control bar — preview open", async ({ page }) => {
    await page.goto("/debug/control-bar");
    await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible();
    await page.getByRole("button", { name: "Show preview" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("cb-preview"), fullPage: true });
  });

  test("control bar — extended menu", async ({ page }) => {
    await page.goto("/debug/control-bar");
    await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible();
    await page.getByLabel("Message").click({ button: "right" });
    await expect(page.getByRole("button", { name: "Close control bar menu" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("cb-extended-menu"), fullPage: true });
  });

  test("pub page — loading state", async ({ page }) => {
    await page.goto("/p/test-slug-nonexistent");
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("pub-loading"), fullPage: true });
  });
});
