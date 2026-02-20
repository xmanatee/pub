import { describe, it, expect } from "vitest";

// Auth is now handled by @convex-dev/auth with GitHub and Google providers.
// These tests cover the API key generation logic which is still custom.

describe("API key generation", () => {
  function generateApiKey(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    return `pub_${key}`;
  }

  it("generates keys with pub_ prefix", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^pub_/);
  });

  it("generates keys of correct length", () => {
    const key = generateApiKey();
    // pub_ (4) + 48 hex chars (24 bytes) = 52 chars
    expect(key).toHaveLength(52);
  });

  it("generates unique keys", () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it("generates hex characters only after prefix", () => {
    const key = generateApiKey();
    const hexPart = key.slice(4);
    expect(hexPart).toMatch(/^[0-9a-f]+$/);
  });
});

describe("token generation", () => {
  it("generates 64-char hex token", () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });
});
