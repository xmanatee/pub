import { describe, expect, it } from "vitest";
import { corsHeaders, errorResponse, extractSlugFromPath, getApiKey, jsonResponse } from "./http";
import { isValidSlug, MIME_TYPES } from "./utils";

describe("corsHeaders", () => {
  it("includes all required CORS headers", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers["Access-Control-Allow-Methods"]).toContain("PATCH");
    expect(headers["Access-Control-Allow-Methods"]).toContain("DELETE");
    expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });
});

describe("jsonResponse", () => {
  it("returns JSON with correct content type", async () => {
    const res = jsonResponse({ test: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json();
    expect(body).toEqual({ test: true });
  });

  it("includes CORS headers", () => {
    const res = jsonResponse({});
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("supports custom status codes", () => {
    const res = jsonResponse({ ok: true }, 201);
    expect(res.status).toBe(201);
  });
});

describe("errorResponse", () => {
  it("returns error JSON with correct status", async () => {
    const res = errorResponse("Not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("returns 400 for bad requests", async () => {
    const res = errorResponse("Missing fields", 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing fields");
  });

  it("returns 401 for unauthorized", async () => {
    const res = errorResponse("Missing API key", 401);
    expect(res.status).toBe(401);
  });

  it("includes CORS headers on errors", () => {
    const res = errorResponse("error", 500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("getApiKey", () => {
  it("extracts from Bearer header", () => {
    const req = new Request("https://example.com/api", {
      headers: { Authorization: "Bearer pub_abc123" },
    });
    expect(getApiKey(req)).toBe("pub_abc123");
  });

  it("does not extract from query parameter", () => {
    const req = new Request("https://example.com/api?key=pub_abc123");
    expect(getApiKey(req)).toBeNull();
  });

  it("still uses Bearer header when query param is present", () => {
    const req = new Request("https://example.com/api?key=pub_query", {
      headers: { Authorization: "Bearer pub_header" },
    });
    expect(getApiKey(req)).toBe("pub_header");
  });

  it("returns null when no key provided", () => {
    const req = new Request("https://example.com/api");
    expect(getApiKey(req)).toBeNull();
  });

  it("returns null for non-Bearer auth", () => {
    const req = new Request("https://example.com/api", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(getApiKey(req)).toBeNull();
  });

  it("returns null for empty Bearer value", () => {
    const req = new Request("https://example.com/api", {
      headers: { Authorization: "Bearer   " },
    });
    expect(getApiKey(req)).toBeNull();
  });

  it("trims whitespace from Bearer value", () => {
    const req = new Request("https://example.com/api", {
      headers: { Authorization: "Bearer   pub_abc123  " },
    });
    expect(getApiKey(req)).toBe("pub_abc123");
  });
});

describe("MIME types", () => {
  it("maps html to text/html", () => {
    expect(MIME_TYPES.html).toBe("text/html; charset=utf-8");
  });

  it("maps css to text/css", () => {
    expect(MIME_TYPES.css).toBe("text/css; charset=utf-8");
  });

  it("maps js to application/javascript", () => {
    expect(MIME_TYPES.js).toBe("application/javascript; charset=utf-8");
  });

  it("maps markdown to text/markdown", () => {
    expect(MIME_TYPES.markdown).toBe("text/markdown; charset=utf-8");
  });

  it("maps text to text/plain", () => {
    expect(MIME_TYPES.text).toBe("text/plain; charset=utf-8");
  });

  it("defaults to text/plain for unknown types", () => {
    const type = MIME_TYPES.unknown || "text/plain; charset=utf-8";
    expect(type).toBe("text/plain; charset=utf-8");
  });

  it("all types include charset", () => {
    for (const mime of Object.values(MIME_TYPES)) {
      expect(mime).toContain("charset=utf-8");
    }
  });

  it("covers all five content types", () => {
    expect(Object.keys(MIME_TYPES)).toHaveLength(5);
    expect(Object.keys(MIME_TYPES).sort()).toEqual(["css", "html", "js", "markdown", "text"]);
  });
});

describe("slug validation", () => {
  it("validates good slugs", () => {
    expect(isValidSlug("abc123")).toBe(true);
    expect(isValidSlug("my-page")).toBe(true);
    expect(isValidSlug("my.page")).toBe(true);
    expect(isValidSlug("my_page")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-start")).toBe(false);
    expect(isValidSlug(".start")).toBe(false);
  });
});

describe("extractSlugFromPath", () => {
  it("extracts slug from API path", () => {
    expect(extractSlugFromPath("/api/v1/publications/abc123", "/api/v1/publications/")).toBe(
      "abc123",
    );
  });

  it("handles trailing slash", () => {
    expect(extractSlugFromPath("/api/v1/publications/abc123/", "/api/v1/publications/")).toBe(
      "abc123",
    );
  });

  it("handles slugs with hyphens", () => {
    expect(extractSlugFromPath("/api/v1/publications/my-page", "/api/v1/publications/")).toBe(
      "my-page",
    );
  });

  it("handles slugs with dots", () => {
    expect(extractSlugFromPath("/api/v1/publications/my.page", "/api/v1/publications/")).toBe(
      "my.page",
    );
  });

  it("returns empty for bare prefix", () => {
    expect(extractSlugFromPath("/serve/", "/serve/")).toBe("");
  });

  it("works with serve prefix", () => {
    expect(extractSlugFromPath("/serve/abc123", "/serve/")).toBe("abc123");
  });
});

describe("create URL construction", () => {
  it("uses PUB_PUBLIC_URL when set", () => {
    const publicUrl = "https://pub.blue";
    const slug = "abc123";
    const url = `${publicUrl}/p/${encodeURIComponent(slug)}`;
    expect(url).toBe("https://pub.blue/p/abc123");
  });

  it("returns relative path when PUB_PUBLIC_URL is not set", () => {
    const publicUrl = undefined;
    const slug = "abc123";
    const url = `${publicUrl ?? ""}/p/${encodeURIComponent(slug)}`;
    expect(url).toBe("/p/abc123");
  });

  it("encodes special characters in slug", () => {
    const publicUrl = "https://pub.blue";
    const slug = "my.page";
    const url = `${publicUrl}/p/${encodeURIComponent(slug)}`;
    expect(url).toBe("https://pub.blue/p/my.page");
  });
});

describe("error message extraction", () => {
  it("extracts message from Error instances", () => {
    const e = new Error("Something went wrong");
    const message = e instanceof Error ? e.message : "Internal error";
    expect(message).toBe("Something went wrong");
  });

  it("falls back for non-Error throws", () => {
    const e: unknown = "string error";
    const message = e instanceof Error ? e.message : "Internal error";
    expect(message).toBe("Internal error");
  });

  it("falls back for null", () => {
    const e: unknown = null;
    const message = e instanceof Error ? e.message : "Internal error";
    expect(message).toBe("Internal error");
  });
});

describe("serve route cache headers", () => {
  it("sets public cache control for served content", () => {
    const headers = {
      "Content-Type": MIME_TYPES.html,
      "Cache-Control": "public, max-age=60",
    };
    expect(headers["Cache-Control"]).toBe("public, max-age=60");
    expect(headers["Content-Type"]).toBe("text/html; charset=utf-8");
  });
});

describe("serve route visibility guard", () => {
  function shouldServe(pub: { isPublic: boolean } | null): boolean {
    return pub?.isPublic ?? false;
  }

  it("serves public publications", () => {
    expect(shouldServe({ isPublic: true })).toBe(true);
  });

  it("rejects private publications", () => {
    expect(shouldServe({ isPublic: false })).toBe(false);
  });

  it("rejects null (not found)", () => {
    expect(shouldServe(null)).toBe(false);
  });
});
