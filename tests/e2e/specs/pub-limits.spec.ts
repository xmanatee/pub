import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedPubs, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Pub limits", () => {
  test("free user can create up to 10 pubs", async () => {
    const user = seedUser("Limit User");
    seedPubs(user.userId, 10, "limit");

    const list = await (await new ApiClient({ user }).listPubs()).json();
    expect(list.pubs.length).toBe(10);
  });

  test("11th pub is rejected with limit error", async () => {
    const user = seedUser("Limit User");
    const api = new ApiClient({ user });
    seedPubs(user.userId, 10, "cap");

    const res = await api.createPub({ slug: "over-limit" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/Pub limit reached/);
  });

  test("deleting a pub frees a slot", async () => {
    const user = seedUser("Limit User");
    const api = new ApiClient({ user });
    seedPubs(user.userId, 10, "slot");

    expect((await api.deletePub("slot-0")).status).toBe(200);

    const res = await api.createPub({ slug: "reclaimed" });
    expect(res.status).toBe(201);
  });

  test("limits are per-user", async () => {
    const user1 = seedUser("User A");
    const user2 = seedUser("User B");
    const api1 = new ApiClient({ user: user1 });
    const api2 = new ApiClient({ user: user2 });
    seedPubs(user1.userId, 10, "u1");

    expect((await api1.createPub({ slug: "u1-over" })).status).toBe(429);
    expect((await api2.createPub({ slug: "u2-ok" })).status).toBe(201);
  });
});
