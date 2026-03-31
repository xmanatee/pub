import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Pub limits", () => {
  test("free user can create up to 10 pubs", async () => {
    const user = seedUser("Limit User");
    const api = new ApiClient({ user });

    for (let i = 0; i < 10; i++) {
      const res = await api.createPub({ slug: `limit-${i}` });
      expect(res.status, `pub ${i} should succeed`).toBe(201);
    }

    const list = await (await api.listPubs()).json();
    expect(list.pubs.length).toBe(10);
  });

  test("11th pub is rejected with limit error", async () => {
    const user = seedUser("Limit User");
    const api = new ApiClient({ user });

    for (let i = 0; i < 10; i++) {
      expect((await api.createPub({ slug: `cap-${i}` })).status).toBe(201);
    }

    const res = await api.createPub({ slug: "over-limit" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/Pub limit reached/);
  });

  test("deleting a pub frees a slot", async () => {
    const user = seedUser("Limit User");
    const api = new ApiClient({ user });

    for (let i = 0; i < 10; i++) {
      expect((await api.createPub({ slug: `slot-${i}` })).status).toBe(201);
    }

    expect((await api.deletePub("slot-0")).status).toBe(200);

    const res = await api.createPub({ slug: "reclaimed" });
    expect(res.status).toBe(201);
  });

  test("limits are per-user", async () => {
    const user1 = seedUser("User A");
    const user2 = seedUser("User B");
    const api1 = new ApiClient({ user: user1 });
    const api2 = new ApiClient({ user: user2 });

    for (let i = 0; i < 10; i++) {
      expect((await api1.createPub({ slug: `u1-${i}` })).status).toBe(201);
    }

    expect((await api1.createPub({ slug: "u1-over" })).status).toBe(429);
    expect((await api2.createPub({ slug: "u2-ok" })).status).toBe(201);
  });
});
