import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero content", async ({ page }) => {
    await page.goto("/");
    const heroHeading = page.getByRole("heading", { name: "One app to rule them all." });
    await expect(heroHeading).toBeVisible();
  });
});
