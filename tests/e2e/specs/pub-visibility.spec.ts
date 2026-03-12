import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Pub visibility", () => {
  test("pubs are private by default", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "priv", title: "Private" });
    const body = await (await api.getPub("priv")).json();
    expect(body.pub.isPublic).toBe(false);
  });

  test("make pub public via update", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "to-public" });
    await api.updatePub("to-public", { isPublic: true });
    const body = await (await api.getPub("to-public")).json();
    expect(body.pub.isPublic).toBe(true);
  });

  test("toggle visibility back to private", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "toggle" });
    await api.updatePub("toggle", { isPublic: true });
    await api.updatePub("toggle", { isPublic: false });
    const body = await (await api.getPub("toggle")).json();
    expect(body.pub.isPublic).toBe(false);
  });

  test("explore page shows public pubs", async ({ page }) => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "explore-pub", title: "Explore Me", content: "<h1>Hi</h1>" });
    await api.updatePub("explore-pub", { isPublic: true });

    await page.goto("/explore");
    await expect(page.getByText("Explore Me")).toBeVisible({ timeout: 10_000 });
  });

  test("explore page hides private pubs", async ({ page }) => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "hidden", title: "Hidden From Explore" });

    await page.goto("/explore");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Hidden From Explore")).not.toBeVisible();
  });
});
