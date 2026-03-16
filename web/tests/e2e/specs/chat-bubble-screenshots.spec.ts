import { expect, test } from "@playwright/test";
import { freezeAnimations, SCREENSHOT_DIR, stableScreenshot } from "../helpers/screenshot-utils";

const DELIVERY_TOLERANCE = 0.002;
const MIXED_CONVERSATION_TOLERANCE = 0.006;

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 6000 } });

test.describe("Chat bubble screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debug/chat-bubbles");
    await expect(page.getByRole("heading", { name: "Chat Bubbles Debug" })).toBeVisible();
    await freezeAnimations(page);
  });

  test("text bubbles", async ({ page }) => {
    const section = page.getByTestId("batch-text-bubbles");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-text.png`);
  });

  test("audio bubbles", async ({ page }) => {
    const section = page.getByTestId("batch-audio-bubbles");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-audio.png`);
  });

  test("image bubbles", async ({ page }) => {
    const section = page.getByTestId("batch-image-bubbles");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-image.png`);
  });

  test("delivery statuses", async ({ page }) => {
    const section = page.getByTestId("batch-delivery-statuses");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-delivery.png`, {
      maxDiffRatio: DELIVERY_TOLERANCE,
    });
  });

  test("system messages", async ({ page }) => {
    const section = page.getByTestId("batch-system-messages");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-system.png`);
  });

  test("mixed conversation", async ({ page }) => {
    const section = page.getByTestId("batch-mixed-conversation");
    await expect(section).toBeVisible();
    await stableScreenshot(section, `${SCREENSHOT_DIR}/chat-bubble-mixed.png`, {
      maxDiffRatio: MIXED_CONVERSATION_TOLERANCE,
    });
  });
});
