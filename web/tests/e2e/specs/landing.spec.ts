import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero content and primary CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Adaptive interfaces that/i })).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Get started", exact: true }),
    ).toBeVisible();
  });
});
