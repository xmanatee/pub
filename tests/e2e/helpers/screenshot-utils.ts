import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const SCREENSHOT_DIR = "tests/e2e/snapshots";
const DEFAULT_MAX_DIFF_RATIO = 0;
export const ANIMATED_TOLERANCE = 0.005;

interface StableScreenshotOptions {
  maxDiffRatio?: number;
  fullPage?: boolean;
}

/**
 * Take a screenshot and only overwrite the committed file when the pixel
 * difference exceeds `maxDiffRatio` (default 0.5%).
 *
 * This absorbs tiny GPU-compositing jitter (backdrop-filter, mask-composite,
 * translateZ layers) that is visually imperceptible but produces different
 * bytes on every render.
 */
export async function stableScreenshot(
  target: Locator | Page,
  filePath: string,
  options?: StableScreenshotOptions,
) {
  const maxDiffRatio = options?.maxDiffRatio ?? DEFAULT_MAX_DIFF_RATIO;
  const tmpPath = join(tmpdir(), `pw-${Date.now()}-${basename(filePath)}`);

  await target.screenshot({ path: tmpPath, fullPage: options?.fullPage });

  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    copyFileSync(tmpPath, filePath);
    return;
  }

  const oldBuf = readFileSync(filePath);
  const newBuf = readFileSync(tmpPath);

  if (oldBuf.equals(newBuf)) return;

  const oldPng = PNG.sync.read(oldBuf);
  const newPng = PNG.sync.read(newBuf);

  if (oldPng.width !== newPng.width || oldPng.height !== newPng.height) {
    copyFileSync(tmpPath, filePath);
    return;
  }

  const totalPixels = oldPng.width * oldPng.height;
  const diffPixels = pixelmatch(oldPng.data, newPng.data, null, oldPng.width, oldPng.height, {
    threshold: 0.1,
  });

  if (diffPixels / totalPixels > maxDiffRatio) {
    copyFileSync(tmpPath, filePath);
  }
}

/**
 * Freeze CSS animations at a deterministic frame and disable transitions.
 *
 * Injected via `addStyleTag` so the rules live outside Tailwind v4's
 * `@layer base` and reliably override component CSS.
 */
export async function freezeAnimations(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-play-state: paused !important;
        animation-delay: -0.5s !important;
        transition-duration: 0s !important;
      }
    `,
  });
}
