import { describe, expect, it } from "vitest";
import { parseInitDataUser, validateInitData } from "./telegram";

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

async function buildInitData(
  botToken: string,
  params: Record<string, string>,
): Promise<string> {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretHash = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken));
  const dataKey = await crypto.subtle.importKey(
    "raw",
    secretHash,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", dataKey, encoder.encode(dataCheckString));
  const hash = Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  const allParams = new URLSearchParams({ ...params, hash });
  return allParams.toString();
}

describe("validateInitData", () => {
  const botToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
  const futureAuthDate = String(Math.floor(Date.now() / 1000) + 100);

  it("validates correctly signed initData", async () => {
    const user = JSON.stringify({ id: 1, first_name: "Test" });
    const raw = await buildInitData(botToken, { user, auth_date: futureAuthDate });

    await expect(validateInitData(raw, botToken, 86400)).resolves.toBeUndefined();
  });

  it("throws on tampered hash", async () => {
    const user = JSON.stringify({ id: 1, first_name: "Test" });
    const raw = await buildInitData(botToken, { user, auth_date: futureAuthDate });
    const tampered = raw.replace(/hash=[^&]+/, "hash=0000000000000000000000000000000000000000000000000000000000000000");

    await expect(validateInitData(tampered, botToken, 86400)).rejects.toThrow(
      "Invalid initData signature",
    );
  });

  it("throws on wrong bot token", async () => {
    const user = JSON.stringify({ id: 1, first_name: "Test" });
    const raw = await buildInitData(botToken, { user, auth_date: futureAuthDate });

    await expect(validateInitData(raw, "999999:WRONG-TOKEN", 86400)).rejects.toThrow(
      "Invalid initData signature",
    );
  });

  it("throws when hash is missing", async () => {
    const raw = "user=%7B%22id%22%3A1%7D&auth_date=1234567890";

    await expect(validateInitData(raw, botToken, 86400)).rejects.toThrow(
      "Missing hash in initData",
    );
  });

  it("throws on expired initData", async () => {
    const oldDate = String(Math.floor(Date.now() / 1000) - 100000);
    const user = JSON.stringify({ id: 1, first_name: "Test" });
    const raw = await buildInitData(botToken, { user, auth_date: oldDate });

    await expect(validateInitData(raw, botToken, 86400)).rejects.toThrow("initData expired");
  });
});
