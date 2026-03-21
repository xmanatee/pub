import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero content and primary CTA", async ({ page }) => {
    await page.goto("/");
    const heroHeading = page.getByRole("heading", { name: "One app to rule them all." });
    await expect(heroHeading).toBeVisible();

    const heroSection = heroHeading.locator("xpath=ancestor::section[1]");
    await expect(
      heroSection.getByRole("link", { name: "Sign in", exact: true }).first(),
    ).toBeVisible();
  });
});
