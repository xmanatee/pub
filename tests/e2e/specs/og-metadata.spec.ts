import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedUser } from "../fixtures/convex";

function withOgMeta(opts: { title?: string; description?: string; body?: string }) {
  const tags: string[] = [];
  if (opts.title) tags.push(`<meta property="og:title" content="${opts.title}" />`);
  if (opts.description) {
    tags.push(`<meta property="og:description" content="${opts.description}" />`);
  }
  return `<!DOCTYPE html>
<html>
  <head>${tags.length ? `\n    ${tags.join("\n    ")}` : ""}</head>
  <body>${opts.body ?? "<h1>Hello</h1>"}</body>
</html>`;
}

function withTitleTag(title: string) {
  return `<!DOCTYPE html>
<html>
  <head><title>${title}</title></head>
  <body><p>content</p></body>
</html>`;
}

function withMetaDescription(desc: string) {
  return `<!DOCTYPE html>
<html>
  <head><meta name="description" content="${desc}" /></head>
  <body><p>content</p></body>
</html>`;
}

test.beforeEach(() => {
  clearAll();
});

test.describe("OG metadata extraction", () => {
  test("extracts og:title and og:description on create", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const content = withOgMeta({ title: "My App", description: "A cool app" });
    expect((await api.createPub({ slug: "og-extract", content })).status).toBe(201);

    const body = await (await api.getPub("og-extract")).json();
    expect(body.pub.title).toBe("My App");
    expect(body.pub.description).toBe("A cool app");
  });

  test("falls back to <title> when no og:title", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    expect(
      (await api.createPub({ slug: "title-fallback", content: withTitleTag("Page Title") })).status,
    ).toBe(201);

    const body = await (await api.getPub("title-fallback")).json();
    expect(body.pub.title).toBe("Page Title");
  });

  test("falls back to meta description when no og:description", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const content = withMetaDescription("Meta desc");
    expect((await api.createPub({ slug: "desc-fallback", content })).status).toBe(201);

    const body = await (await api.getPub("desc-fallback")).json();
    expect(body.pub.description).toBe("Meta desc");
  });

  test("re-extracts metadata on update", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "og-update", content: withOgMeta({ title: "Original" }) });
    await api.updatePub("og-update", { content: withOgMeta({ title: "Updated" }) });

    const body = await (await api.getPub("og-update")).json();
    expect(body.pub.title).toBe("Updated");
  });

  test("no title or description when HTML has no metadata", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    expect((await api.createPub({ slug: "no-meta", content: "<p>bare</p>" })).status).toBe(201);

    const body = await (await api.getPub("no-meta")).json();
    expect(body.pub.title).toBeUndefined();
    expect(body.pub.description).toBeUndefined();
  });
});

test.describe("OG tag injection on serve", () => {
  test("does not duplicate existing og:title", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const content = withOgMeta({ title: "Existing Title" });
    await api.createPub({ slug: "og-no-dupe", content });
    await api.updatePub("og-no-dupe", { isPublic: true });

    const html = await (await api.servePub("og-no-dupe")).text();
    const matches = html.match(/og:title/g) ?? [];
    expect(matches.length).toBe(1);
  });

  test("injects supplemental og tags when none exist", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "og-inject", content: "<p>no og tags</p>" });
    await api.updatePub("og-inject", { isPublic: true });

    const html = await (await api.servePub("og-inject")).text();
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:type"');
    expect(html).toContain('property="og:url"');
    expect(html).toContain('property="og:image"');
  });

  test("uses pub title in injected og:title", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({
      slug: "og-title-inject",
      content: withTitleTag("Fallback Title"),
    });
    await api.updatePub("og-title-inject", { isPublic: true });

    const html = await (await api.servePub("og-title-inject")).text();
    expect(html).toContain("Fallback Title");
  });
});
