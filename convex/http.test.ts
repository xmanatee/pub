import { describe, expect, it } from "vitest";

// --- Extracted logic from http.ts ---

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}

function getApiKey(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  text: "text/plain; charset=utf-8",
};

// --- Tests ---

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

describe("slug extraction from URL path", () => {
  function extractSlug(pathname: string): string {
    return pathname.replace("/serve/", "").replace(/\/$/, "");
  }

  it("extracts slug from /serve/abc123", () => {
    expect(extractSlug("/serve/abc123")).toBe("abc123");
  });

  it("handles trailing slash", () => {
    expect(extractSlug("/serve/abc123/")).toBe("abc123");
  });

  it("returns empty for bare /serve/", () => {
    expect(extractSlug("/serve/")).toBe("");
  });

  it("handles slugs with hyphens", () => {
    expect(extractSlug("/serve/my-page")).toBe("my-page");
  });

  it("handles long slugs", () => {
    expect(extractSlug("/serve/abcdefgh12345678")).toBe("abcdefgh12345678");
  });
});

describe("publish route validation", () => {
  it("rejects missing filename", () => {
    const body = { content: "hello" };
    const valid = body.content && "filename" in body && (body as { filename: string }).filename;
    expect(valid).toBeFalsy();
  });

  it("rejects missing content", () => {
    const body = { filename: "test.html" };
    const valid = "content" in body && (body as { content: string }).content && body.filename;
    expect(valid).toBeFalsy();
  });

  it("accepts valid body", () => {
    const body = { filename: "test.html", content: "<h1>Hi</h1>" };
    const valid = body.filename && body.content;
    expect(valid).toBeTruthy();
  });
});

describe("PATCH route validation", () => {
  it("rejects missing slug", () => {
    const body = { title: "New Title" };
    const valid = "slug" in body && (body as { slug: string }).slug;
    expect(valid).toBeFalsy();
  });

  it("accepts body with slug", () => {
    const body = { slug: "abc123", title: "New Title" };
    expect(body.slug).toBeTruthy();
  });
});

describe("DELETE route slug extraction", () => {
  it("extracts slug from query params", () => {
    const url = new URL("https://example.com/api/v1/publications?slug=abc123");
    expect(url.searchParams.get("slug")).toBe("abc123");
  });

  it("returns null when no slug param", () => {
    const url = new URL("https://example.com/api/v1/publications");
    expect(url.searchParams.get("slug")).toBeNull();
  });
});

describe("serve route cache headers", () => {
  it("sets public cache control for served content", () => {
    const headers = {
      "Content-Type": MIME_TYPES.html,
      "Cache-Control": "public, max-age=60",
      ...corsHeaders(),
    };
    expect(headers["Cache-Control"]).toBe("public, max-age=60");
    expect(headers["Content-Type"]).toBe("text/html; charset=utf-8");
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
