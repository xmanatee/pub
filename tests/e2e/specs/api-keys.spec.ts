import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, getState, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("API Keys", () => {
  test("valid API key authenticates pub operations", async () => {
    const user = seedUser("Key User");
    const api = new ApiClient({ user });

    const res = await api.createPub({ slug: "key-test", title: "Key Test" });
    expect(res.status).toBe(201);
  });

  test("invalid API key is rejected", async () => {
    const { convexSiteUrl } = getState();
    const res = await fetch(`${convexSiteUrl}/api/v1/pubs`, {
      method: "POST",
      headers: {
        Authorization: "Bearer pub_invalidkey123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug: "bad-key" }),
    });
    // Server rejects invalid keys (401 or 500 depending on key format)
    expect(res.ok).toBe(false);
  });

  test("different users have isolated pubs", async () => {
    const user1 = seedUser("User A");
    const user2 = seedUser("User B");
    const api1 = new ApiClient({ user: user1 });
    const api2 = new ApiClient({ user: user2 });

    await api1.createPub({ slug: "user1-pub", title: "User 1" });
    await api2.createPub({ slug: "user2-pub", title: "User 2" });

    const list1 = await (await api1.listPubs()).json();
    const list2 = await (await api2.listPubs()).json();

    expect(list1.pubs.some((p: { slug: string }) => p.slug === "user1-pub")).toBe(true);
    expect(list1.pubs.some((p: { slug: string }) => p.slug === "user2-pub")).toBe(false);

    expect(list2.pubs.some((p: { slug: string }) => p.slug === "user2-pub")).toBe(true);
    expect(list2.pubs.some((p: { slug: string }) => p.slug === "user1-pub")).toBe(false);
  });
});
