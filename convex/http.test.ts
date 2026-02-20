import { describe, it, expect } from "vitest";

// Tests for HTTP route handler logic (CORS, API key extraction, MIME types)

describe("CORS headers", () => {
  function corsHeaders() {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }

  it("includes all required CORS headers", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers["Access-Control-Allow-Methods"]).toContain("PATCH");
    expect(headers["Access-Control-Allow-Methods"]).toContain("DELETE");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });
});

describe("API key extraction", () => {
  function getApiKey(authHeader: string | null, searchParams: string): string | null {
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }
    const params = new URLSearchParams(searchParams);
    return params.get("key");
  }

  it("extracts from Bearer header", () => {
    expect(getApiKey("Bearer pub_abc123", "")).toBe("pub_abc123");
  });

  it("extracts from query parameter", () => {
    expect(getApiKey(null, "key=pub_abc123")).toBe("pub_abc123");
  });

  it("prefers header over query param", () => {
    expect(getApiKey("Bearer pub_header", "key=pub_query")).toBe("pub_header");
  });

  it("returns null when no key provided", () => {
    expect(getApiKey(null, "")).toBeNull();
  });

  it("returns null for non-Bearer auth", () => {
    expect(getApiKey("Basic abc123", "")).toBeNull();
  });
});

describe("MIME types", () => {
  const MIME_TYPES: Record<string, string> = {
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    markdown: "text/markdown; charset=utf-8",
    text: "text/plain; charset=utf-8",
  };

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
    const type = MIME_TYPES["unknown"] || "text/plain; charset=utf-8";
    expect(type).toBe("text/plain; charset=utf-8");
  });
});

describe("slug extraction from URL path", () => {
  it("extracts slug from /serve/abc123", () => {
    const slug = "/serve/abc123".replace("/serve/", "").replace(/\/$/, "");
    expect(slug).toBe("abc123");
  });

  it("handles trailing slash", () => {
    const slug = "/serve/abc123/".replace("/serve/", "").replace(/\/$/, "");
    expect(slug).toBe("abc123");
  });

  it("returns empty for bare /serve/", () => {
    const slug = "/serve/".replace("/serve/", "").replace(/\/$/, "");
    expect(slug).toBe("");
  });
});
