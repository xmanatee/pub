import { describe, expect, it } from "vitest";

describe("daemon code path imports", () => {
  it(
    "loads reflect-metadata before tsyringe (via werift)",
    async () => {
      // This import chain mirrors what PUB_DAEMON_MODE=1 triggers in index.ts.
      // If reflect-metadata is missing or loads after tsyringe, the import throws:
      //   "tsyringe requires a reflect polyfill"
      await expect(import("./live-daemon-entry.js")).resolves.toBeDefined();
    },
    15_000,
  );
});
