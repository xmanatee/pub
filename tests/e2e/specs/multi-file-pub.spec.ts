import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, getState, runMutation, seedUser } from "../fixtures/convex";

const INDEX_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta property="og:title" content="Multi File App" />
    <link rel="stylesheet" href="style.css" />
    <script src="app.js" defer></script>
  </head>
  <body><h1 id="heading">Multi File</h1></body>
</html>`;

const STYLE_CSS = `h1 { color: rgb(0, 128, 0); }`;

const APP_JS = `document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("heading").dataset.jsLoaded = "true";
});`;

const DATA_JSON = `{"version":1,"items":[{"id":"a"},{"id":"b"}]}`;

const NESTED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
</svg>`;

const ALL_FILES: Record<string, string> = {
  "index.html": INDEX_HTML,
  "style.css": STYLE_CSS,
  "app.js": APP_JS,
  "data.json": DATA_JSON,
  "assets/icon.svg": NESTED_SVG,
};

test.beforeEach(() => {
  clearAll();
});

test.describe("Multi-file pub", () => {
  test("create with multiple files and retrieve all", async () => {
    const user = seedUser("Multi User");
    const api = new ApiClient({ user });

    const res = await api.createPub({ slug: "multi", files: ALL_FILES });
    expect(res.status).toBe(201);

    const body = await (await api.getPub("multi")).json();
    expect(body.pub.fileCount).toBe(5);
    expect(body.pub.files["index.html"]).toBe(INDEX_HTML);
    expect(body.pub.files["style.css"]).toBe(STYLE_CSS);
    expect(body.pub.files["app.js"]).toBe(APP_JS);
    expect(body.pub.files["data.json"]).toBe(DATA_JSON);
    expect(body.pub.files["assets/icon.svg"]).toBe(NESTED_SVG);
  });

  test("serve individual files by sub-path", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "serve-multi", files: ALL_FILES });
    await api.updatePub("serve-multi", { isPublic: true });

    const indexRes = await api.servePub("serve-multi");
    expect(indexRes.status).toBe(200);
    const indexHtml = await indexRes.text();
    expect(indexHtml).toContain('<h1 id="heading">Multi File</h1>');
    expect(indexRes.headers.get("content-type")).toContain("text/html");

    const cssRes = await api.servePub("serve-multi", "style.css");
    expect(cssRes.status).toBe(200);
    expect(await cssRes.text()).toBe(STYLE_CSS);
    expect(cssRes.headers.get("content-type")).toContain("text/css");

    const jsRes = await api.servePub("serve-multi", "app.js");
    expect(jsRes.status).toBe(200);
    expect(await jsRes.text()).toBe(APP_JS);
    expect(jsRes.headers.get("content-type")).toContain("javascript");

    const jsonRes = await api.servePub("serve-multi", "data.json");
    expect(jsonRes.status).toBe(200);
    expect(await jsonRes.text()).toBe(DATA_JSON);
    expect(jsonRes.headers.get("content-type")).toContain("json");

    const svgRes = await api.servePub("serve-multi", "assets/icon.svg");
    expect(svgRes.status).toBe(200);
    expect(await svgRes.text()).toBe(NESTED_SVG);
    expect(svgRes.headers.get("content-type")).toContain("svg");
  });

  test("CSS and JS load from sibling files in browser", async ({ page }) => {
    const user = seedUser();
    const api = new ApiClient({ user });
    const { convexSiteUrl } = getState();

    await api.createPub({ slug: "interop", files: ALL_FILES });
    await api.updatePub("interop", { isPublic: true });

    await page.goto(`${convexSiteUrl}/serve/interop/`);

    const heading = page.locator("#heading");
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const color = await heading.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(0, 128, 0)");

    await expect(heading).toHaveAttribute("data-js-loaded", "true", { timeout: 5_000 });
  });

  test("nonexistent sub-path returns 404", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "multi-404", files: ALL_FILES });
    await api.updatePub("multi-404", { isPublic: true });

    expect((await api.servePub("multi-404", "missing.txt")).status).toBe(404);
    expect((await api.servePub("multi-404", "assets/nope.png")).status).toBe(404);
  });

  test("update replaces all files atomically", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "multi-update", files: ALL_FILES });

    const newFiles = {
      "index.html": "<h1>V2</h1>",
      "style.css": "body { color: green; }",
      "new-file.txt": "hello world",
    };
    await api.updatePub("multi-update", { files: newFiles });

    const body = await (await api.getPub("multi-update")).json();
    expect(body.pub.fileCount).toBe(3);
    expect(body.pub.files["index.html"]).toBe("<h1>V2</h1>");
    expect(body.pub.files["style.css"]).toBe("body { color: green; }");
    expect(body.pub.files["new-file.txt"]).toBe("hello world");
    expect(body.pub.files["app.js"]).toBeUndefined();
    expect(body.pub.files["data.json"]).toBeUndefined();
    expect(body.pub.files["assets/icon.svg"]).toBeUndefined();
  });

  test("duplicate copies all files to new pub", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "multi-dup-src", files: ALL_FILES });
    const source = await (await api.getPub("multi-dup-src")).json();

    const result = JSON.parse(
      runMutation("testing:duplicatePub", {
        userId: user.userId,
        pubId: source.pub.id,
      }),
    );

    const copy = await (await api.getPub(result.slug)).json();
    expect(copy.pub.fileCount).toBe(5);
    expect(copy.pub.files["index.html"]).toBe(INDEX_HTML);
    expect(copy.pub.files["style.css"]).toBe(STYLE_CSS);
    expect(copy.pub.files["app.js"]).toBe(APP_JS);
    expect(copy.pub.files["data.json"]).toBe(DATA_JSON);
    expect(copy.pub.files["assets/icon.svg"]).toBe(NESTED_SVG);
  });

  test("deleting pub removes all files", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "multi-del", files: ALL_FILES });
    expect((await api.deletePub("multi-del")).status).toBe(200);

    expect((await api.getPub("multi-del")).status).toBe(404);

    const counts = JSON.parse(runMutation("testing:getUserDataCounts", { userId: user.userId }));
    expect(counts.pubs).toBe(0);
    expect(counts.pubFiles).toBe(0);
  });

  test("index.html is required", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const res = await api.createPub({
      slug: "no-index",
      files: { "style.css": "body {}", "app.js": "console.log(1);" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("index.html");
  });
});
