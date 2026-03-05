import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero content and primary CTA", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Show what your AI agent built/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Start visualizing/i })).toBeVisible();
  });
});
