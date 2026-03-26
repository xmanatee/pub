import { expect, test } from "@playwright/test";

async function gotoLanding(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/(?:\?.*)?$/, { timeout: 15_000 });
}

test.describe("Landing page", () => {
  test("renders hero content", async ({ page }) => {
    await gotoLanding(page);
    const heroHeading = page.getByRole("heading", { name: "One app to rule them all." });
    await expect(heroHeading).toBeVisible({ timeout: 15_000 });
  });
});
