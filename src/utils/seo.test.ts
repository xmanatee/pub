import { describe, expect, it } from "vitest";
import { seo } from "./seo";

describe("seo", () => {
  it("returns array of meta tags", () => {
    const result = seo({ title: "Test", description: "A test page" });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(6);
  });

  it("includes title tag", () => {
    const result = seo({ title: "My Page", description: "Desc" });
    expect(result).toContainEqual({ title: "My Page" });
  });

  it("includes description meta tag", () => {
    const result = seo({ title: "My Page", description: "Desc" });
    expect(result).toContainEqual({ name: "description", content: "Desc" });
  });

  it("includes Open Graph title", () => {
    const result = seo({ title: "My Page", description: "Desc" });
    expect(result).toContainEqual({ name: "og:title", content: "My Page" });
  });

  it("includes Open Graph description", () => {
    const result = seo({ title: "My Page", description: "Desc" });
    expect(result).toContainEqual({ name: "og:description", content: "Desc" });
  });

  it("includes Twitter title", () => {
    const result = seo({ title: "My Page", description: "Desc" });
    expect(result).toContainEqual({ name: "twitter:title", content: "My Page" });
  });

  it("includes Twitter description", () => {
    const result = seo({ title: "My Page", description: "Desc" });
    expect(result).toContainEqual({ name: "twitter:description", content: "Desc" });
  });

  it("handles empty strings", () => {
    const result = seo({ title: "", description: "" });
    expect(result).toContainEqual({ title: "" });
    expect(result).toContainEqual({ name: "description", content: "" });
  });

  it("handles special characters", () => {
    const result = seo({ title: "Page <em>&</em>", description: 'She said "hello"' });
    expect(result).toContainEqual({ title: "Page <em>&</em>" });
    expect(result).toContainEqual({ name: "description", content: 'She said "hello"' });
  });
});
