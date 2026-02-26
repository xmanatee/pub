import { describe, expect, it } from "vitest";
import { corsHeaders, errorResponse, extractSlugFromPath, getApiKey, jsonResponse } from "./http";
import { MIME_TYPES } from "./utils";

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
    expect(extractSlugFromPath("/api/v1/publications/abc123", "/api/v1/publications/")).toBe(
      "abc123",
    );
  });

  it("strips trailing slash", () => {
    expect(extractSlugFromPath("/api/v1/publications/abc123/", "/api/v1/publications/")).toBe(
      "abc123",
    );
  });

  it("handles slugs with special chars", () => {
    expect(extractSlugFromPath("/serve/my-page.v2", "/serve/")).toBe("my-page.v2");
  });

  it("returns empty for bare prefix", () => {
    expect(extractSlugFromPath("/serve/", "/serve/")).toBe("");
  });
});

describe("MIME types", () => {
  it("maps all content types correctly", () => {
    expect(MIME_TYPES.html).toBe("text/html; charset=utf-8");
    expect(MIME_TYPES.markdown).toBe("text/markdown; charset=utf-8");
    expect(MIME_TYPES.text).toBe("text/plain; charset=utf-8");
  });

  it("covers exactly the three content types", () => {
    expect(Object.keys(MIME_TYPES).sort()).toEqual(["html", "markdown", "text"]);
  });
});
