import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CROSS_ORIGIN_SANDBOX_ATTR,
  DENIED_SANDBOX_TOKENS,
  IFRAME_ALLOW_ATTR,
} from "./sandbox-policy";

const CONVEX_SHARED_PATH = resolve(__dirname, "../../../../../convex/http/shared.ts");
const CROSS_ORIGIN_TOKENS = CROSS_ORIGIN_SANDBOX_ATTR.split(" ");
const PERMISSIONS_FEATURES = IFRAME_ALLOW_ATTR.split("; ");

function parseFromConvexShared(pattern: RegExp): string[] {
  const source = readFileSync(CONVEX_SHARED_PATH, "utf-8");
  const match = source.match(pattern);
  if (!match) throw new Error(`Pattern not found in ${CONVEX_SHARED_PATH}`);
  return match[1]
    .split(/[\s,]+/)
    .filter(Boolean)
    .sort();
}

describe("sandbox tokens", () => {
  it("cross-origin includes allow-same-origin", () => {
    expect(CROSS_ORIGIN_TOKENS).toContain("allow-same-origin");
  });

  it("no denied tokens", () => {
    for (const denied of DENIED_SANDBOX_TOKENS) {
      expect(CROSS_ORIGIN_TOKENS).not.toContain(denied);
    }
  });

  it("no duplicate tokens", () => {
    expect(new Set(CROSS_ORIGIN_TOKENS).size).toBe(CROSS_ORIGIN_TOKENS.length);
  });

  it("every token starts with allow-", () => {
    for (const token of CROSS_ORIGIN_TOKENS) {
      expect(token).toMatch(/^allow-/);
    }
  });
});

describe("permissions policy features", () => {
  it("no duplicates", () => {
    expect(new Set(PERMISSIONS_FEATURES).size).toBe(PERMISSIONS_FEATURES.length);
  });

  it("all lowercase kebab-case", () => {
    for (const feature of PERMISSIONS_FEATURES) {
      expect(feature).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it("includes camera and microphone", () => {
    expect(PERMISSIONS_FEATURES).toContain("camera");
    expect(PERMISSIONS_FEATURES).toContain("microphone");
  });

  it("does not include dangerous hardware features", () => {
    for (const denied of ["serial", "usb", "bluetooth", "hid"]) {
      expect(PERMISSIONS_FEATURES).not.toContain(denied);
    }
  });
});

describe("convex/http/shared.ts consistency", () => {
  it("CSP sandbox tokens match the canonical cross-origin set", () => {
    const cspTokens = parseFromConvexShared(/"sandbox ([^"]+)"/);
    expect(cspTokens).toEqual([...CROSS_ORIGIN_TOKENS].sort());
  });

  it("Permissions-Policy features match the canonical set", () => {
    const headerFeatures = parseFromConvexShared(
      /CONTENT_PERMISSIONS_POLICY = \[([\s\S]*?)\]\.join/,
    );
    const cleaned = headerFeatures
      .map((s) => s.replace(/["'=*,]/g, "").trim())
      .filter(Boolean)
      .sort();
    expect(cleaned).toEqual([...PERMISSIONS_FEATURES].sort());
  });
});
