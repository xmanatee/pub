import { describe, expect, it } from "vitest";
import { mergeDefaultTunnelConfig } from "./start.js";

describe("live start tunnel config", () => {
  it("keeps the default super-app config while applying partial relay overrides", () => {
    const config = mergeDefaultTunnelConfig(
      {
        devCommand: "vite dev",
        devCwd: "/tmp/pub-super-app",
        devPort: 5173,
        relayUrl: "https://relay.example",
      },
      { relayUrl: "http://localhost:4102" },
    );

    expect(config).toEqual({
      devCommand: "vite dev",
      devCwd: "/tmp/pub-super-app",
      devPort: 5173,
      relayUrl: "http://localhost:4102",
    });
  });

  it("uses a fully custom tunnel command when one is configured", () => {
    const config = mergeDefaultTunnelConfig(
      {
        devCommand: "vite dev",
        devCwd: "/tmp/pub-super-app",
        devPort: 5173,
        relayUrl: "https://relay.example",
      },
      {
        devCommand: "pnpm dev",
        devCwd: "/tmp/custom",
        devPort: 3000,
        relayUrl: "http://localhost:4102",
      },
    );

    expect(config).toEqual({
      devCommand: "pnpm dev",
      devCwd: "/tmp/custom",
      devPort: 3000,
      relayUrl: "http://localhost:4102",
    });
  });
});
