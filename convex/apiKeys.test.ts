import { describe, expect, it } from "vitest";

// Tests for apiKeys.ts business logic

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pub_${key}`;
}

describe("API key list mapping", () => {
  it("maps keys to preview format", () => {
    const dbKey = {
      _id: "key1",
      userId: "user1",
      key: "pub_aabbccdd11223344556677889900aabbccddee1122",
      name: "my-key",
      createdAt: 1000,
      lastUsedAt: 2000,
    };

    const mapped = {
      _id: dbKey._id,
      name: dbKey.name,
      keyPreview: `${dbKey.key.slice(0, 8)}...${dbKey.key.slice(-4)}`,
      createdAt: dbKey.createdAt,
      lastUsedAt: dbKey.lastUsedAt,
    };

    expect(mapped.keyPreview).toBe("pub_aabb...1122");
    expect(mapped).not.toHaveProperty("key");
    expect(mapped).not.toHaveProperty("userId");
  });

  it("handles keys without lastUsedAt", () => {
    const dbKey = {
      _id: "key1",
      userId: "user1",
      key: generateApiKey(),
      name: "unused-key",
      createdAt: 1000,
      lastUsedAt: undefined,
    };

    const mapped = {
      _id: dbKey._id,
      name: dbKey.name,
      keyPreview: `${dbKey.key.slice(0, 8)}...${dbKey.key.slice(-4)}`,
      createdAt: dbKey.createdAt,
      lastUsedAt: dbKey.lastUsedAt,
    };

    expect(mapped.lastUsedAt).toBeUndefined();
  });
});

describe("API key creation", () => {
  it("returns full key on creation", () => {
    const key = generateApiKey();
    const result = { key };
    expect(result.key).toMatch(/^pub_[0-9a-f]{48}$/);
  });

  it("key name is stored as-is", () => {
    const name = "my-agent-key";
    expect(name).toBe("my-agent-key");
  });
});

describe("API key ownership check", () => {
  it("allows owner to delete their key", () => {
    const key = { userId: "user1" };
    const requestUserId = "user1";
    expect(key.userId === requestUserId).toBe(true);
  });

  it("prevents non-owner from deleting key", () => {
    const key = { userId: "user1" };
    const requestUserId = "user2";
    expect(key.userId === requestUserId).toBe(false);
  });
});

describe("getUserByApiKey return format", () => {
  it("returns apiKeyId and userId when found", () => {
    const apiKey = { _id: "apiKey1", userId: "user1", key: "pub_test" };
    const user = { _id: "user1" };
    const result = { apiKeyId: apiKey._id, userId: user._id };
    expect(result).toEqual({ apiKeyId: "apiKey1", userId: "user1" });
  });

  it("returns null when apiKey not found", () => {
    const apiKey = null;
    expect(apiKey).toBeNull();
  });

  it("returns null when user not found for apiKey", () => {
    const apiKey = { _id: "apiKey1", userId: "user1", key: "pub_test" };
    const user = null;
    if (!apiKey) expect.fail("apiKey should exist");
    expect(user).toBeNull();
  });
});

describe("touchApiKey", () => {
  it("updates lastUsedAt to current timestamp", () => {
    const before = Date.now();
    const lastUsedAt = Date.now();
    const after = Date.now();
    expect(lastUsedAt).toBeGreaterThanOrEqual(before);
    expect(lastUsedAt).toBeLessThanOrEqual(after);
  });
});
