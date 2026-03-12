import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, getState, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Pub CRUD via API", () => {
  test("create pub with auto-generated slug", async () => {
    const user = seedUser("CRUD User");
    const api = new ApiClient({ user });

    const res = await api.createPub({ title: "Test Pub", content: "<h1>Hello</h1>" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBeTruthy();
  });

  test("create pub with custom slug", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const res = await api.createPub({ slug: "my-test-pub", title: "Custom" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("my-test-pub");
  });

  test("get pub by slug", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "get-test", content: "<p>content</p>" });
    const res = await api.getPub("get-test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pub.slug).toBe("get-test");
    expect(body.pub.content).toBe("<p>content</p>");
  });

  test("list pubs", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "list-1", title: "First" });
    await api.createPub({ slug: "list-2", title: "Second" });
    const res = await api.listPubs();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pubs.length).toBeGreaterThanOrEqual(2);
  });

  test("update pub", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "update-test", title: "Original" });
    const updateRes = await api.updatePub("update-test", {
      title: "Updated",
      content: "<p>new</p>",
    });
    expect(updateRes.status).toBe(200);

    const get = await api.getPub("update-test");
    const body = await get.json();
    expect(body.pub.title).toBe("Updated");
    expect(body.pub.content).toBe("<p>new</p>");
  });

  test("rename pub slug", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "old-slug", title: "Rename Me" });
    await api.updatePub("old-slug", { slug: "new-slug" });

    expect((await api.getPub("old-slug")).status).toBe(404);
    expect((await api.getPub("new-slug")).status).toBe(200);
  });

  test("delete pub", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "delete-me" });
    expect((await api.deletePub("delete-me")).status).toBe(200);
    expect((await api.getPub("delete-me")).status).toBe(404);
  });

  test("reject invalid slug", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const res = await api.createPub({ slug: "invalid slug!" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("reject duplicate slug", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "dupe" });
    const res = await api.createPub({ slug: "dupe" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("create multiple pubs sequentially", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    // Create 3 pubs (within rate limit burst capacity)
    for (let i = 0; i < 3; i++) {
      expect((await api.createPub({ slug: `multi-${i}` })).status).toBe(201);
    }

    // All 3 should appear in the list
    const list = await (await api.listPubs()).json();
    expect(list.pubs.length).toBe(3);
  });

  test("reject unauthenticated request", async () => {
    const { convexSiteUrl } = getState();
    const res = await fetch(`${convexSiteUrl}/api/v1/pubs`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});
