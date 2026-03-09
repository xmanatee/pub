import { expect, type Page, test } from "@playwright/test";

async function openControlBarDebug(page: Page) {
  await page.goto("/debug/control-bar");
  await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible({
    timeout: 15_000,
  });
  await page.locator("details summary").click();
  await page.waitForTimeout(200);
}

function interactiveSection(page: Page) {
  return page.locator("details[open]");
}

async function readControlMetrics(page: Page) {
  return interactiveSection(page)
    .getByLabel("Message")
    .evaluate((input) => {
      const row = input.parentElement as HTMLElement | null;
      if (!row) {
        throw new Error("Message input row not found");
      }

      let shell = row.parentElement as HTMLElement | null;

      while (shell) {
        if (shell.classList.contains("overflow-hidden") && shell.classList.contains("flex-col")) {
          break;
        }
        shell = shell.parentElement as HTMLElement | null;
      }
      if (!shell) {
        throw new Error("Control shell not found");
      }

      return {
        rowHeight: row.getBoundingClientRect().height,
        shellHeight: shell.getBoundingClientRect().height,
      };
    });
}

test.describe("Control bar layout", () => {
  test("idle control row height is 48px", async ({ page }) => {
    await openControlBarDebug(page);
    const { rowHeight } = await readControlMetrics(page);
    expect(rowHeight).toBeCloseTo(48, 0);
  });

  test("preview opens and expands shell height", async ({ page }) => {
    await openControlBarDebug(page);
    const baseline = (await readControlMetrics(page)).shellHeight;
    await interactiveSection(page).getByRole("button", { name: "Show preview" }).click();

    // Wait for the max-h transition to settle
    await page.waitForTimeout(600);
    const expanded = (await readControlMetrics(page)).shellHeight;
    expect(expanded).toBeGreaterThan(baseline + 30);

    await interactiveSection(page).getByRole("button", { name: "Hide preview" }).click();
    await page.waitForTimeout(600);
    const collapsed = (await readControlMetrics(page)).shellHeight;
    expect(collapsed).toBeCloseTo(baseline, 0);
  });

  test("menu opens and closes via Open menu button", async ({ page }) => {
    await openControlBarDebug(page);
    const baseline = (await readControlMetrics(page)).shellHeight;

    // Open menu via the "Open menu" button scoped to the interactive section
    await interactiveSection(page).getByRole("button", { name: "Open menu" }).click();

    // Wait for menu expand transition
    await page.waitForTimeout(600);
    const expanded = (await readControlMetrics(page)).shellHeight;
    expect(expanded).toBeGreaterThan(baseline + 30);

    // Close via the "Close menu" button in the interactive section
    await interactiveSection(page).getByRole("button", { name: "Close menu" }).click();
    await page.waitForTimeout(600);
    const collapsed = (await readControlMetrics(page)).shellHeight;
    expect(collapsed).toBeCloseTo(baseline, 0);
  });
});
