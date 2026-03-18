import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServePreviewUrl } from "./pub-preview-iframe";

beforeEach(() => {
  vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
});

describe("buildServePreviewUrl", () => {
  it("returns an absolute URL pointing to the Convex site origin", () => {
    expect(buildServePreviewUrl("my-slug")).toBe(
      "https://example.convex.site/serve/my-slug?preview=1",
    );
  });
});
