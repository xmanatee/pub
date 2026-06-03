import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseInitDataUser } from "./telegram";
import { validateTelegramInitData } from "./telegram_init_data";

function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}

describe("parseInitDataUser", () => {
  it("parses valid initData with all fields", () => {
    const user = { id: 123456, first_name: "John", last_name: "Doe", username: "johndoe" };
    const raw = `auth_date=1234567890&hash=abc123&user=${encodeURIComponent(JSON.stringify(user))}`;

    const result = parseInitDataUser(raw);
    expect(result).toEqual({
      id: 123456,
      first_name: "John",
      last_name: "Doe",
      username: "johndoe",
    });
  });

  it("parses initData with minimal user fields", () => {
    const user = { id: 789, first_name: "Alice" };
    const raw = `user=${encodeURIComponent(JSON.stringify(user))}&hash=def456`;

    const result = parseInitDataUser(raw);
    expect(result.id).toBe(789);
    expect(result.first_name).toBe("Alice");
    expect(result.last_name).toBeUndefined();
  });

  it("throws when user field is missing", () => {
    const raw = "auth_date=1234567890&hash=abc123";
    expect(() => parseInitDataUser(raw)).toThrow("Missing user in initData");
  });

  it("throws when user JSON is invalid", () => {
    const raw = "user=not-json&hash=abc";
    expect(() => parseInitDataUser(raw)).toThrow();
  });

  it("throws when user has no id", () => {
    const user = { first_name: "Bob" };
    const raw = `user=${encodeURIComponent(JSON.stringify(user))}`;
    expect(() => parseInitDataUser(raw)).toThrow("Invalid user in initData");
  });

  it("throws when user has no first_name", () => {
    const user = { id: 123 };
    const raw = `user=${encodeURIComponent(JSON.stringify(user))}`;
    expect(() => parseInitDataUser(raw)).toThrow("Invalid user in initData");
  });

  it("preserves photo_url", () => {
    const user = { id: 1, first_name: "X", photo_url: "https://t.me/photo.jpg" };
    const raw = `user=${encodeURIComponent(JSON.stringify(user))}`;

    const result = parseInitDataUser(raw);
    expect(result.photo_url).toBe("https://t.me/photo.jpg");
  });
});

describe("validate", () => {
  const botToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

  it("validates correctly signed initData", async () => {
    const raw = signInitData(
      { user: JSON.stringify({ id: 1, first_name: "Test" }), auth_date: "2000000000" },
      botToken,
    );

    await expect(
      validateTelegramInitData(raw, botToken, { nowSeconds: 2_000_000_100 }),
    ).resolves.toBeUndefined();
  });

  it("throws on tampered hash", async () => {
    const raw = signInitData(
      { user: JSON.stringify({ id: 1, first_name: "Test" }), auth_date: "2000000000" },
      botToken,
    );
    const fakeHash = "0".repeat(64);
    const tampered = raw.replace(/hash=[^&]+/, `hash=${fakeHash}`);

    await expect(
      validateTelegramInitData(tampered, botToken, { nowSeconds: 2_000_000_100 }),
    ).rejects.toThrow();
  });

  it("throws on wrong bot token", async () => {
    const raw = signInitData(
      { user: JSON.stringify({ id: 1, first_name: "Test" }), auth_date: "2000000000" },
      botToken,
    );

    await expect(
      validateTelegramInitData(raw, "999999:WRONG-TOKEN", { nowSeconds: 2_000_000_100 }),
    ).rejects.toThrow();
  });

  it("throws when hash is missing", async () => {
    const raw = "user=%7B%22id%22%3A1%7D&auth_date=1234567890";

    await expect(validateTelegramInitData(raw, botToken)).rejects.toThrow();
  });

  it("throws on expired initData", async () => {
    const raw = signInitData(
      { user: JSON.stringify({ id: 1, first_name: "Test" }), auth_date: "2000000000" },
      botToken,
    );

    await expect(
      validateTelegramInitData(raw, botToken, {
        nowSeconds: 2_000_000_100,
        expiresInSeconds: 1,
      }),
    ).rejects.toThrow();
  });
});
