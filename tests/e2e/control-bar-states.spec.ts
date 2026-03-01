import { test } from "@playwright/test";

const ALL_STATES = [
  "connecting",
  "disconnected",
  "waiting-content",
  "idle",
  "agent-thinking",
  "agent-replying",
] as const;

test.describe("Control bar visual states", () => {
  test("screenshot all states grid", async ({ page }) => {
    await page.goto("/debug/control-bar");
    await page.getByRole("heading", { name: "Control Bar Debug" }).waitFor();
    await page.getByRole("button", { name: "All states" }).click();
    await page.getByTestId("all-states-grid").waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "tests/e2e/screenshots/cb-all-states.png",
      fullPage: true,
    });
  });

  for (const state of ALL_STATES) {
    test(`screenshot state: ${state}`, async ({ page }) => {
      await page.goto("/debug/control-bar");
      await page.getByRole("heading", { name: "Control Bar Debug" }).waitFor();
      await page.getByRole("button", { name: state, exact: true }).click();
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `tests/e2e/screenshots/cb-state-${state}.png`,
      });
    });
  }
});
