import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const ip = require("./index.cjs");

describe("ip compatibility shim", () => {
  it("detects only canonical IPv4 and IPv6 strings", () => {
    expect(ip.isV4Format("127.0.0.1")).toBe(true);
    expect(ip.isV4Format("127.1")).toBe(false);
    expect(ip.isV4Format("012.1.2.3")).toBe(false);
    expect(ip.isV6Format("::1")).toBe(true);
    expect(ip.isV6Format("not-an-ip")).toBe(false);
  });

  it("detects IPv4, IPv6, and IPv4-mapped loopback addresses", () => {
    expect(ip.isLoopback("127.0.0.1")).toBe(true);
    expect(ip.isLoopback("127.10.20.30")).toBe(true);
    expect(ip.isLoopback("::1")).toBe(true);
    expect(ip.isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(ip.isLoopback("192.0.2.15")).toBe(false);
    expect(ip.isLoopback("fe80::1")).toBe(false);
    expect(ip.isLoopback("not-an-ip")).toBe(false);
  });

  it("encodes and decodes IPv4 buffers", () => {
    const bytes = ip.toBuffer("192.0.2.15");

    expect(Array.from(bytes)).toEqual([192, 0, 2, 15]);
    expect(ip.toString(bytes)).toBe("192.0.2.15");
  });

  it("encodes and decodes IPv6 buffers", () => {
    const bytes = ip.toBuffer("2001:db8::1");

    expect(bytes).toHaveLength(16);
    expect(ip.toString(bytes)).toBe("2001:db8::1");
  });

  it("writes into caller-provided buffers with an offset", () => {
    const buffer = Buffer.alloc(8);

    expect(ip.toBuffer("10.0.0.1", buffer, 2)).toBe(buffer);
    expect(Array.from(buffer.subarray(2, 6))).toEqual([10, 0, 0, 1]);
    expect(ip.toString(buffer, 2, 4)).toBe("10.0.0.1");
  });
});
