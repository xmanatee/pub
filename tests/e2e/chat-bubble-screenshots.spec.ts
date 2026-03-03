import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "./screenshot-utils";

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 6000 } });

async function setupPage(page: Page) {
  await page.goto("/debug/chat-bubbles");
  await expect(page.getByRole("heading", { name: "Chat Bubbles Debug" })).toBeVisible();
  await freezeAnimations(page);
}

test.describe("Chat bubble screenshots", () => {
  test("text bubbles", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-text-bubbles");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-text.png`);
  });

  test("audio bubbles", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-audio-bubbles");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-audio.png`);
  });

  test("image bubbles", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-image-bubbles");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-image.png`);
  });

  test("delivery statuses", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-delivery-statuses");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-delivery.png`);
  });

  test("mixed conversation", async ({ page }) => {
    await setupPage(page);
    const section = page.getByTestId("batch-mixed-conversation");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-mixed.png`);
  });
});
