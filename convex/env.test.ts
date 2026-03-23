import { afterEach, describe, expect, it } from "vitest";
import { getPublicUrl, getSiteUrl } from "./env";

describe("getSiteUrl", () => {
  const original = process.env.CONVEX_SITE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.CONVEX_SITE_URL;
    else process.env.CONVEX_SITE_URL = original;
  });

  it("returns the value when set", () => {
    process.env.CONVEX_SITE_URL = "https://api.pub.blue";
    expect(getSiteUrl()).toBe("https://api.pub.blue");
  });

  it("throws when not set", () => {
    delete process.env.CONVEX_SITE_URL;
    expect(() => getSiteUrl()).toThrow("CONVEX_SITE_URL is not set");
  });

  it("throws when empty string", () => {
    process.env.CONVEX_SITE_URL = "";
    expect(() => getSiteUrl()).toThrow("CONVEX_SITE_URL is not set");
  });
});

describe("getPublicUrl", () => {
  const original = process.env.PUB_PUBLIC_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.PUB_PUBLIC_URL;
    else process.env.PUB_PUBLIC_URL = original;
  });

  it("returns the value when set", () => {
    process.env.PUB_PUBLIC_URL = "https://pub.blue";
    expect(getPublicUrl()).toBe("https://pub.blue");
  });

  it("throws when not set", () => {
    delete process.env.PUB_PUBLIC_URL;
    expect(() => getPublicUrl()).toThrow("PUB_PUBLIC_URL is not set");
  });

  it("throws when empty string", () => {
    process.env.PUB_PUBLIC_URL = "";
    expect(() => getPublicUrl()).toThrow("PUB_PUBLIC_URL is not set");
  });
});
