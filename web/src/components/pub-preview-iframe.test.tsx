import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServeUrl } from "./pub-preview-iframe";

beforeEach(() => {
  vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
});

describe("buildServeUrl", () => {
  it("returns an absolute URL pointing to the Convex site origin", () => {
    expect(buildServeUrl("my-slug")).toBe("https://example.convex.site/serve/my-slug");
  });
});
