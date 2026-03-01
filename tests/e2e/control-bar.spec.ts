import { expect, type Page, test } from "@playwright/test";

async function openControlBarDebug(page: Page) {
  await page.goto("/debug/control-bar");
  await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible();
}

async function readControlMetrics(page: Page) {
  return page.getByLabel("Message").evaluate((input) => {
    const row = input.parentElement as HTMLElement | null;
    if (!row) {
      throw new Error("Message input row not found");
    }

    let shell = row.parentElement as HTMLElement | null;

    while (shell) {
      if (shell.classList.contains("min-h-16") && shell.classList.contains("overflow-hidden")) {
        break;
      }
      shell = shell.parentElement as HTMLElement | null;
    }
    if (!shell) {
      throw new Error("Control shell not found");
    }

    return {
      rowHeight: row.getBoundingClientRect().height,
      shellHasHardLock: shell.classList.contains("h-16"),
      shellHeight: shell.getBoundingClientRect().height,
    };
  });
}

async function sampleShellHeights(page: Page, samples = 8, intervalMs = 40) {
  const heights: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    heights.push((await readControlMetrics(page)).shellHeight);
    await page.waitForTimeout(intervalMs);
  }
  return heights;
}

test.describe("Control bar layout", () => {
  test("idle control row height is 64px", async ({ page }) => {
    await openControlBarDebug(page);
    const { rowHeight, shellHasHardLock } = await readControlMetrics(page);

    expect(rowHeight).toBeCloseTo(64, 0);
    expect(shellHasHardLock).toBeFalsy();
  });

  test("preview opens and closes with animated shell height", async ({ page }) => {
    await openControlBarDebug(page);
    const baseline = (await readControlMetrics(page)).shellHeight;
    await page.getByRole("button", { name: "Show preview" }).click();

    const openHeights = await sampleShellHeights(page);
    const endOpen = openHeights[openHeights.length - 1];

    expect(
      openHeights.some((height) => height > baseline + 1 && height < endOpen - 1),
    ).toBeTruthy();
    expect(endOpen).toBeGreaterThan(baseline + 30);

    await page.getByRole("button", { name: "Hide preview" }).click();
    const closeHeights = await sampleShellHeights(page);
    const startClose = closeHeights[0];
    const endClose = closeHeights[closeHeights.length - 1];

    expect(
      closeHeights.some((height) => height > baseline + 1 && height < startClose - 1),
    ).toBeTruthy();
    expect(endClose).toBeCloseTo(baseline, 0);
  });

  test("extended options open and close without hard height snap", async ({ page }) => {
    await openControlBarDebug(page);
    const baseline = (await readControlMetrics(page)).shellHeight;

    await page.getByLabel("Message").click({ button: "right" });
    await expect(page.getByRole("button", { name: "Close control bar menu" })).toBeVisible();

    const openHeights = await sampleShellHeights(page);
    const endOpen = openHeights[openHeights.length - 1];

    expect(
      openHeights.some((height) => height > baseline + 1 && height < endOpen - 1),
    ).toBeTruthy();
    expect(endOpen).toBeGreaterThan(baseline + 30);

    await page.getByRole("button", { name: "Close control bar menu" }).click();
    const closeHeights = await sampleShellHeights(page);
    const startClose = closeHeights[0];
    const endCloseMetrics = await readControlMetrics(page);

    expect(
      closeHeights.some((height) => height > baseline + 1 && height < startClose - 1),
    ).toBeTruthy();
    expect(endCloseMetrics.shellHeight).toBeCloseTo(baseline, 0);
    expect(endCloseMetrics.shellHasHardLock).toBeFalsy();
  });
});
