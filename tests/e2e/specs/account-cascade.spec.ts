import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, runMutation, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Account cascade deletion", () => {
  test("deleting account removes all user data", async () => {
    const user = seedUser("Doomed User");
    const api = new ApiClient({ user });

    await api.createPub({
      slug: "cascade-1",
      files: {
        "index.html": "<h1>One</h1>",
        "style.css": "body {}",
      },
    });
    await api.createPub({
      slug: "cascade-2",
      files: {
        "index.html": "<h1>Two</h1>",
        "app.js": "console.log(1);",
        "data.json": "{}",
      },
    });

    const before = JSON.parse(runMutation("testing:getUserDataCounts", { userId: user.userId }));
    expect(before.exists).toBe(true);
    expect(before.pubs).toBe(2);
    expect(before.pubFiles).toBe(5);
    expect(before.apiKeys).toBe(1);

    runMutation("testing:deleteUserAccount", { userId: user.userId });

    const after = JSON.parse(runMutation("testing:getUserDataCounts", { userId: user.userId }));
    expect(after.exists).toBe(false);
    expect(after.pubs).toBe(0);
    expect(after.pubFiles).toBe(0);
    expect(after.apiKeys).toBe(0);
    expect(after.hosts).toBe(0);
    expect(after.connections).toBe(0);
  });

  test("deleting one user does not affect another", async () => {
    const userA = seedUser("User A");
    const userB = seedUser("User B");
    const apiA = new ApiClient({ user: userA });
    const apiB = new ApiClient({ user: userB });

    await apiA.createPub({
      slug: "a-pub",
      files: { "index.html": "<p>A</p>", "a.css": ".a{}" },
    });
    await apiB.createPub({
      slug: "b-pub",
      files: { "index.html": "<p>B</p>", "b.css": ".b{}" },
    });

    runMutation("testing:deleteUserAccount", { userId: userA.userId });

    const afterA = JSON.parse(runMutation("testing:getUserDataCounts", { userId: userA.userId }));
    expect(afterA.exists).toBe(false);
    expect(afterA.pubs).toBe(0);
    expect(afterA.pubFiles).toBe(0);

    const afterB = JSON.parse(runMutation("testing:getUserDataCounts", { userId: userB.userId }));
    expect(afterB.exists).toBe(true);
    expect(afterB.pubs).toBe(1);
    expect(afterB.pubFiles).toBe(2);
    expect(afterB.apiKeys).toBe(1);

    const list = await (await apiB.listPubs()).json();
    expect(list.pubs.length).toBe(1);
    expect(list.pubs[0].slug).toBe("b-pub");
  });

  test("API key stops working after account deletion", async () => {
    const user = seedUser("Deleted User");
    const api = new ApiClient({ user });

    await api.createPub({ slug: "dead-pub" });
    runMutation("testing:deleteUserAccount", { userId: user.userId });

    const res = await api.listPubs();
    expect(res.ok).toBe(false);
  });
});
