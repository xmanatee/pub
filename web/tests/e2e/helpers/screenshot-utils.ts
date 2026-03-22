import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const SCREENSHOT_DIR = "tests/e2e/snapshots";
const DEFAULT_MAX_DIFF_RATIO = 0.0015;
export const ANIMATED_TOLERANCE = 0.007;
const DEBUG_PAGE_TIMEOUT_MS = 15_000;

const UPDATE_SNAPSHOTS = !!process.env.UPDATE_SNAPSHOTS;

interface StableScreenshotOptions {
  maxDiffRatio?: number;
  fullPage?: boolean;
}

function diffBaseline(
  candidatePath: string,
  baselinePath: string,
  maxDiffRatio: number,
): string | null {
  if (!existsSync(baselinePath)) {
    return `Missing screenshot baseline: ${baselinePath}. Candidate image: ${candidatePath}`;
  }

  const oldBuf = readFileSync(baselinePath);
  const newBuf = readFileSync(candidatePath);

  if (oldBuf.equals(newBuf)) return null;

  const oldPng = PNG.sync.read(oldBuf);
  const newPng = PNG.sync.read(newBuf);

  if (oldPng.width !== newPng.width || oldPng.height !== newPng.height) {
    return [
      `Screenshot dimensions changed for ${baselinePath}.`,
      `Expected: ${oldPng.width}x${oldPng.height}`,
      `Received: ${newPng.width}x${newPng.height}`,
      `Candidate image: ${candidatePath}`,
    ].join(" ");
  }

  const totalPixels = oldPng.width * oldPng.height;
  const diff = new PNG({ width: oldPng.width, height: oldPng.height });
  const diffPixels = pixelmatch(oldPng.data, newPng.data, diff.data, oldPng.width, oldPng.height, {
    threshold: 0.1,
  });

  const ratio = diffPixels / totalPixels;
  if (ratio <= maxDiffRatio) return null;

  const diffPath = join(tmpdir(), `pw-diff-${Date.now()}-${basename(baselinePath)}`);
  writeFileSync(diffPath, PNG.sync.write(diff));
  return [
    `Screenshot diff exceeded tolerance for ${baselinePath}.`,
    `Diff ratio: ${ratio.toFixed(6)}`,
    `Allowed ratio: ${maxDiffRatio.toFixed(6)}`,
    `Candidate image: ${candidatePath}`,
    `Diff image: ${diffPath}`,
  ].join(" ");
}

/**
 * Take a screenshot and compare it against the committed baseline.
 * Set `UPDATE_SNAPSHOTS=1` to auto-replace baselines instead of failing.
 */
export async function stableScreenshot(
  target: Locator | Page,
  filePath: string,
  options?: StableScreenshotOptions,
) {
  const maxDiffRatio = options?.maxDiffRatio ?? DEFAULT_MAX_DIFF_RATIO;
  const tmpPath = join(tmpdir(), `pw-${Date.now()}-${basename(filePath)}`);

  await target.screenshot({ path: tmpPath, fullPage: options?.fullPage });

  const failure = diffBaseline(tmpPath, filePath, maxDiffRatio);

  if (!failure) {
    unlinkSync(tmpPath);
    return;
  }

  if (UPDATE_SNAPSHOTS) {
    copyFileSync(tmpPath, filePath);
    unlinkSync(tmpPath);
    return;
  }

  throw new Error(failure);
}

/**
 * Freeze CSS animations at a deterministic frame and disable transitions.
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

/**
 * Open a debug page and wait for its heading to render. Visual debug pages are
 * relatively heavy, and under parallel load they can exceed Playwright's
 * default 5s assertion timeout even though the route is healthy.
 */
export async function openDebugPage(page: Page, path: string, heading: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({
    timeout: DEBUG_PAGE_TIMEOUT_MS,
  });
}
