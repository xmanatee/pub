import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

describe("telegram browser boundary", () => {
  it("keeps GramJS and Telegram sessions out of the browser client module", async () => {
    const client = await readFile(join(root, "features/telegram/client.ts"), "utf8");

    expect(client).not.toMatch(/from ["']telegram(?:\/|["'])/);
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("StringSession");
  });
});
