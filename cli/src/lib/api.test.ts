import { beforeEach, describe, expect, it, vi } from "vitest";
import { PubApiClient } from "./api.js";

describe("PubApiClient", () => {
  const baseUrl = "https://test.convex.site";
  const apiKey = "pub_test123";
  let client: PubApiClient;

  beforeEach(() => {
    client = new PubApiClient(baseUrl, apiKey);
    vi.restoreAllMocks();
  });

  describe("create", () => {
    it("sends POST with correct body and auth header", async () => {
      const mockResponse = {
        slug: "abc123",
        url: "https://test.convex.site/p/abc123",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.create({
        content: "<h1>Hello</h1>",
        filename: "test.html",
        title: "Test",
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/pubs", baseUrl),
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

      await expect(client.create({ content: "test", filename: "test.html" })).rejects.toThrow(
        "Invalid API key",
      );
    });
  });

  describe("list", () => {
    it("fetches pubs list", async () => {
      const mockPubs = [
        {
          slug: "abc",
          contentType: "html",
          isPublic: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ pubs: mockPubs, hasMore: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.list();
      expect(result).toEqual(mockPubs);
    });
  });

  describe("get", () => {
    it("fetches single pub by slug", async () => {
      const mockPub = {
        slug: "abc",
        contentType: "html",
        content: "<h1>Hello</h1>",
        isPublic: true,
        createdAt: 1000,
        updatedAt: 1000,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ pub: mockPub }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.get("abc");
      expect(result).toEqual(mockPub);
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/pubs/abc", baseUrl),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
          }),
        }),
      );
    });
  });

  describe("update", () => {
    it("sends PATCH with slug in path and metadata in body", async () => {
      const mockResult = {
        slug: "abc",
        contentType: "html",
        title: "New Title",
        isPublic: false,
        updatedAt: 2000,
      };

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
        new URL("/api/v1/pubs/abc", baseUrl),
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
    it("sends DELETE with slug in path", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.remove("abc123");

      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/pubs/abc123", baseUrl),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("live methods", () => {
    it("openLive sends POST to live sub-resource", async () => {
      const mockResponse = {
        slug: "abc",
        url: "https://pub.blue/p/abc",
        expiresAt: 9999999,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.openLive("abc", { expiresIn: "24h" });
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/pubs/abc/live", baseUrl),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("getLive fetches live info", async () => {
      const mockLive = {
        slug: "abc",
        status: "active",
        agentOffer: "offer",
        agentCandidates: [],
        browserCandidates: [],
        createdAt: 1000,
        expiresAt: 9999999,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ live: mockLive }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getLive("abc");
      expect(result).toEqual(mockLive);
    });

    it("closeLive sends DELETE to live sub-resource", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.closeLive("abc");
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/pubs/abc/live", baseUrl),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
