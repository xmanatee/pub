import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  errorResponse,
  extractSlugFromPath,
  getApiKey,
  getOgCardData,
  jsonResponse,
  mapLiveError,
  shouldTouchApiKey,
} from "./http/shared";

describe("corsHeaders", () => {
  it("includes all required CORS headers", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Methods"]).toContain("PATCH");
    expect(headers["Access-Control-Allow-Methods"]).toContain("DELETE");
    expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });
});

describe("jsonResponse", () => {
  it("returns JSON with correct content type and status", async () => {
    const res = jsonResponse({ test: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ test: true });
  });

  it("supports custom status codes", () => {
    expect(jsonResponse({ ok: true }, 201).status).toBe(201);
  });

  it("includes CORS and security headers", () => {
    const res = jsonResponse({});
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});

describe("errorResponse", () => {
  it("returns error JSON with correct status", async () => {
    const res = errorResponse("Not found", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("includes CORS headers on errors", () => {
    const res = errorResponse("error", 500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("getApiKey", () => {
  it("extracts Bearer token", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer pub_abc123" },
    });
    expect(getApiKey(req)).toBe("pub_abc123");
  });

  it("returns null when no Authorization header", () => {
    expect(getApiKey(new Request("https://example.com"))).toBeNull();
  });

  it("returns null for non-Bearer auth", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(getApiKey(req)).toBeNull();
  });

  it("returns null for empty Bearer value", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer   " },
    });
    expect(getApiKey(req)).toBeNull();
  });

  it("trims whitespace from token", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer   pub_abc123  " },
    });
    expect(getApiKey(req)).toBe("pub_abc123");
  });
});

describe("extractSlugFromPath", () => {
  it("extracts slug from API path", () => {
    expect(extractSlugFromPath("/api/v1/pubs/abc123", "/api/v1/pubs/")).toBe("abc123");
  });

  it("strips trailing slash", () => {
    expect(extractSlugFromPath("/api/v1/pubs/abc123/", "/api/v1/pubs/")).toBe("abc123");
  });

  it("handles slugs with special chars", () => {
    expect(extractSlugFromPath("/serve/my-page.v2", "/serve/")).toBe("my-page.v2");
  });

  it("returns empty for bare prefix", () => {
    expect(extractSlugFromPath("/serve/", "/serve/")).toBe("");
  });
});

describe("getOgCardData", () => {
  it("returns generic OG data for private or missing pubs", () => {
    expect(getOgCardData(null, "secret-slug")).toEqual({
      title: "pub.blue",
      badgeColor: "#3b82f6",
      badgeText: "PUB.BLUE",
      slugLabel: "",
    });

    expect(
      getOgCardData({ title: "Secret", slug: "secret-slug", isPublic: false }, "secret-slug"),
    ).toEqual({
      title: "pub.blue",
      badgeColor: "#3b82f6",
      badgeText: "PUB.BLUE",
      slugLabel: "",
    });
  });

  it("returns pub details for public entries", () => {
    const og = getOgCardData({ title: "Hello", slug: "hello", isPublic: true }, "hello");
    expect(og.title).toBe("Hello");
    expect(og.badgeText).toBe("PUBLIC");
    expect(og.slugLabel).toBe("/hello");
  });
});

describe("mapLiveError", () => {
  it("maps known live errors to API statuses", () => {
    expect(mapLiveError(new Error("Live not found"))).toEqual({
      message: "Live not found",
      status: 404,
    });
    expect(mapLiveError(new Error("Live assigned to another agent"))).toEqual({
      message: "Live assigned to another agent",
      status: 409,
    });
  });

  it("returns null for unknown failures", () => {
    expect(mapLiveError(new Error("Unexpected failure"))).toBeNull();
  });
});

describe("shouldTouchApiKey", () => {
  it("touches when key has never been used", () => {
    expect(shouldTouchApiKey(undefined, 10_000)).toBe(true);
    expect(shouldTouchApiKey(null, 10_000)).toBe(true);
  });

  it("does not touch when inside touch interval", () => {
    const now = 10 * 60 * 1000;
    const lastUsedAt = now - 60 * 1000;
    expect(shouldTouchApiKey(lastUsedAt, now)).toBe(false);
  });

  it("touches when interval has elapsed", () => {
    const now = 90 * 60 * 1000;
    const lastUsedAt = 0;
    expect(shouldTouchApiKey(lastUsedAt, now)).toBe(true);
  });
});
