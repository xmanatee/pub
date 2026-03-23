import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Content serving", () => {
  test("/serve/:slug returns HTML for public pub", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "served", content: "<h1>Served</h1>" });
    await api.updatePub("served", { isPublic: true });

    const res = await api.servePub("served");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Served");
  });

  test("/serve/:slug returns 404 for private pub", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "private-serve", content: "<p>secret</p>" });

    expect((await api.servePub("private-serve")).status).toBe(404);
  });

  test("/serve/:slug returns 404 for nonexistent", async () => {
    const api = new ApiClient({ user: seedUser() });
    expect((await api.servePub("nonexistent")).status).toBe(404);
  });

  test("/og/:slug returns SVG", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "og-test" });
    await api.updatePub("og-test", { isPublic: true });

    const res = await api.getOgImage("og-test");
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("svg");
  });

  test("/serve/:slug increments view count without error", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "views", content: "<p>views</p>" });
    await api.updatePub("views", { isPublic: true });

    for (let i = 0; i < 3; i++) {
      expect((await api.servePub("views")).status).toBe(200);
    }
  });
});
