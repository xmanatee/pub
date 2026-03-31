import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { clearAll, seedUser } from "../fixtures/convex";

const PRIVATE_CONTENT = `<!DOCTYPE html>
<html>
  <head><meta property="og:title" content="Secret Pub" /></head>
  <body><h1>Private Content</h1></body>
</html>`;

test.beforeEach(() => {
  clearAll();
});

test.describe("Private pub access", () => {
  test("owner sees private pub in browser", async ({ page }) => {
    const user = seedUser("Owner");
    const api = new ApiClient({ user });

    await api.createPub({ slug: "priv-browser", content: PRIVATE_CONTENT });

    await injectAuth(page, user);
    await page.goto("/p/priv-browser");

    await expect(page.getByText("This pub doesn't exist or is not accessible.")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("unauthenticated user cannot see private pub in browser", async ({ page }) => {
    const user = seedUser("Owner");
    const api = new ApiClient({ user });

    await api.createPub({ slug: "priv-unauth", content: PRIVATE_CONTENT });

    await page.goto("/p/priv-unauth");
    await expect(page.getByText("This pub doesn't exist or is not accessible.")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("different user cannot see private pub in browser", async ({ page }) => {
    const owner = seedUser("Owner");
    const other = seedUser("Other User");
    const api = new ApiClient({ user: owner });

    await api.createPub({ slug: "priv-other", content: PRIVATE_CONTENT });

    await injectAuth(page, other);
    await page.goto("/p/priv-other");
    await expect(page.getByText("This pub doesn't exist or is not accessible.")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("making pub public allows unauthenticated /serve access", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "priv-to-pub", content: PRIVATE_CONTENT });
    expect((await api.servePub("priv-to-pub")).status).toBe(404);

    await api.updatePub("priv-to-pub", { isPublic: true });
    const res = await api.servePub("priv-to-pub");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Private Content");
  });
});
