import { expect, type Page, test } from "@playwright/test";

async function openControlBarDebug(page: Page) {
  await page.goto("/debug/control-bar");
  await expect(page.getByRole("heading", { name: "Control Bar Debug" })).toBeVisible({
    timeout: 15_000,
  });
  await page.locator("details summary").click();
  await page.waitForTimeout(200);
  // Scroll so the interactive ControlBar container is fully visible
  await interactiveSection(page).locator(".h-80").scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
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

  test("addons expand and collapse shell", async ({ page }) => {
    await openControlBarDebug(page);

    // Extended options auto-show on bar expansion
    const menu = interactiveSection(page).locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await page.waitForTimeout(600);
    const withAddons = (await readControlMetrics(page)).shellHeight;

    // Focus the textarea to dismiss extended options
    await interactiveSection(page).getByLabel("Message").focus();
    await page.waitForTimeout(600);
    await expect(menu).not.toBeVisible();
    const withoutAddons = (await readControlMetrics(page)).shellHeight;

    expect(withAddons).toBeGreaterThan(withoutAddons + 20);
  });
});
