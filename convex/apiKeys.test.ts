import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, keyPreviewFromKey } from "./utils";

describe("API key preview from real keys", () => {
  it("preview starts with same prefix as full key", () => {
    const key = generateApiKey();
    const preview = keyPreviewFromKey(key);
    expect(key.startsWith(preview.split("...")[0])).toBe(true);
    expect(key.endsWith(preview.split("...")[1])).toBe(true);
  });
});

describe("API key lookup via hash", () => {
  it("same key always hashes to same value", async () => {
    const key = generateApiKey();
    expect(await hashApiKey(key)).toBe(await hashApiKey(key));
  });

  it("different keys hash differently", async () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(await hashApiKey(k1)).not.toBe(await hashApiKey(k2));
  });
});
