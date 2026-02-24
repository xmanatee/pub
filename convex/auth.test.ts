import { describe, expect, it, vi } from "vitest";
import { generateApiKey, keyPreviewFromKey } from "./utils";

describe("API key generation", () => {
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
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateApiKey());
    }
    expect(keys.size).toBe(100);
  });

  it("generates hex characters only after prefix", () => {
    const key = generateApiKey();
    const hexPart = key.slice(4);
    expect(hexPart).toMatch(/^[0-9a-f]+$/);
  });

  it("uses crypto.getRandomValues", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    generateApiKey();
    expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));
    spy.mockRestore();
  });
});

describe("API key preview format", () => {
  it("shows first 8 and last 4 chars", () => {
    const key = "pub_aabbccdd11223344556677889900aabbccddee1122";
    const preview = keyPreviewFromKey(key);
    expect(preview).toBe("pub_aabb...1122");
    expect(preview).toHaveLength(15);
  });

  it("masks the middle of the key", () => {
    const key = generateApiKey();
    const preview = keyPreviewFromKey(key);
    expect(preview).toContain("...");
    expect(preview.length).toBeLessThan(key.length);
  });
});

describe("token generation", () => {
  it("generates 64-char hex token", () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      tokens.add(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
    }
    expect(tokens.size).toBe(50);
  });
});
