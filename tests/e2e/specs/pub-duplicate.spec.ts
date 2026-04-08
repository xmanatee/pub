import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, runMutation, seedPubs, seedUser } from "../fixtures/convex";

function withOgMeta(title: string) {
  return `<!DOCTYPE html>
<html>
  <head><meta property="og:title" content="${title}" /></head>
  <body><h1>${title}</h1></body>
</html>`;
}

test.beforeEach(() => {
  clearAll();
});

test.describe("Pub duplication", () => {
  test("duplicate copies all files", async () => {
    const user = seedUser("Dup User");
    const api = new ApiClient({ user });

    const files = {
      "index.html": withOgMeta("Original"),
      "style.css": "body { color: red; }",
      "app.js": "console.log('hello');",
    };
    await api.createPub({ slug: "dup-source", files });

    const source = await (await api.getPub("dup-source")).json();

    const result = JSON.parse(
      runMutation("testing:duplicatePub", {
        userId: user.userId,
        pubId: source.pub.id,
      }),
    );

    const copy = await (await api.getPub(result.slug)).json();
    expect(copy.pub.files["index.html"]).toContain("Original");
    expect(copy.pub.files["style.css"]).toBe("body { color: red; }");
    expect(copy.pub.files["app.js"]).toBe("console.log('hello');");
    expect(copy.pub.fileCount).toBe(3);
  });

  test("duplicate appends (copy) to title", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "dup-title", content: withOgMeta("My App") });
    const source = await (await api.getPub("dup-title")).json();

    const result = JSON.parse(
      runMutation("testing:duplicatePub", {
        userId: user.userId,
        pubId: source.pub.id,
      }),
    );

    const copy = await (await api.getPub(result.slug)).json();
    expect(copy.pub.title).toBe("My App (copy)");
  });

  test("duplicate is always private", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "dup-vis" });
    await api.updatePub("dup-vis", { isPublic: true });
    const source = await (await api.getPub("dup-vis")).json();

    const result = JSON.parse(
      runMutation("testing:duplicatePub", {
        userId: user.userId,
        pubId: source.pub.id,
      }),
    );

    const copy = await (await api.getPub(result.slug)).json();
    expect(copy.pub.isPublic).toBe(false);
  });

  test("duplicate resets view count", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "dup-views", content: "<p>views</p>" });
    await api.updatePub("dup-views", { isPublic: true });
    await api.servePub("dup-views");
    await api.servePub("dup-views");

    const source = await (await api.getPub("dup-views")).json();

    const result = JSON.parse(
      runMutation("testing:duplicatePub", {
        userId: user.userId,
        pubId: source.pub.id,
      }),
    );

    const copy = await (await api.getPub(result.slug)).json();
    expect(copy.pub.viewCount ?? 0).toBe(0);
  });

  test("duplicate at limit is rejected", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });
    seedPubs(user.userId, 10, "dup-lim");

    const source = await (await api.getPub("dup-lim-0")).json();

    expect(() =>
      runMutation("testing:duplicatePub", {
        userId: user.userId,
        pubId: source.pub.id,
      }),
    ).toThrow(/Pub limit reached/);
  });
});
