const encoder = new TextEncoder();
const DEFAULT_EXPIRES_IN_SECONDS = 24 * 60 * 60;

export interface ValidateTelegramInitDataOptions {
  nowSeconds?: number;
  expiresInSeconds?: number;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function hmacSha256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const rawKey = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(encoder.encode(data)),
  );
  return new Uint8Array(signature);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function dataCheckString(params: URLSearchParams): string {
  return Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

async function calculateHash(params: URLSearchParams, botToken: string): Promise<string> {
  const secret = await hmacSha256("WebAppData", botToken);
  return hex(await hmacSha256(secret, dataCheckString(params)));
}

export async function validateTelegramInitData(
  raw: string,
  botToken: string,
  options: ValidateTelegramInitDataOptions = {},
): Promise<void> {
  const params = new URLSearchParams(raw);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw new Error("Missing initData hash");

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) throw new Error("Invalid initData auth_date");

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresInSeconds = options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  if (authDate > nowSeconds + 60) throw new Error("Invalid initData auth_date");
  if (nowSeconds - authDate > expiresInSeconds) throw new Error("Expired initData");

  const expectedHash = await calculateHash(params, botToken);
  if (!constantTimeEqual(receivedHash, expectedHash)) {
    throw new Error("Invalid initData signature");
  }
}
