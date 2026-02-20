import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublishApiClient } from "./api.js";

describe("PublishApiClient", () => {
  const baseUrl = "https://test.convex.site";
  const apiKey = "pub_test123";
  let client: PublishApiClient;

  beforeEach(() => {
    client = new PublishApiClient(baseUrl, apiKey);
    vi.restoreAllMocks();
  });

  describe("publish", () => {
    it("sends POST with correct body and auth header", async () => {
      const mockResponse = {
        slug: "abc123",
        updated: false,
        url: "https://test.convex.site/serve/abc123",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.publish({
        filename: "test.html",
        content: "<h1>Hello</h1>",
        title: "Test",
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/publish", baseUrl),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("throws on error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(
        client.publish({ filename: "test.html", content: "test" }),
      ).rejects.toThrow("Invalid API key");
    });
  });

  describe("list", () => {
    it("fetches publications list", async () => {
      const mockPubs = [
        {
          slug: "abc",
          filename: "test.html",
          contentType: "html",
          isPublic: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ publications: mockPubs }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.list();
      expect(result).toEqual(mockPubs);
    });
  });

  describe("get", () => {
    it("fetches single publication by slug", async () => {
      const mockPub = {
        slug: "abc",
        filename: "test.html",
        contentType: "html",
        content: "<h1>Hello</h1>",
        isPublic: true,
        createdAt: 1000,
        updatedAt: 1000,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ publication: mockPub }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.get("abc");
      expect(result).toEqual(mockPub);
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/publications?slug=abc", baseUrl),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
          }),
        }),
      );
    });
  });

  describe("update", () => {
    it("sends PATCH with slug and metadata", async () => {
      const mockResult = { slug: "abc", title: "New Title", isPublic: false };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResult), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.update({
        slug: "abc",
        title: "New Title",
        isPublic: false,
      });

      expect(result).toEqual(mockResult);
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/publications", baseUrl),
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          }),
        }),
      );
    });
  });

  describe("remove", () => {
    it("sends DELETE with slug parameter", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.remove("abc123");

      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/publications?slug=abc123", baseUrl),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
