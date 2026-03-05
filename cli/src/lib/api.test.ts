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

  describe("response parsing", () => {
    it("throws a clear error when a success response is not JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      );

      await expect(client.listPage()).rejects.toThrow("Invalid JSON response from server (HTTP 200).");
    });

    it("keeps rate-limit messaging when 429 response body is not JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain", "Retry-After": "7" },
        }),
      );

      await expect(client.listPage()).rejects.toThrow("Rate limit exceeded. Retry after 7s.");
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

  describe("deletePub", () => {
    it("sends DELETE with slug in path", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.deletePub("abc123");

      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/pubs/abc123", baseUrl),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("agent presence methods", () => {
    it("goOnline sends POST to agent/online", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.goOnline();
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/online", baseUrl),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("heartbeat sends POST to agent/heartbeat", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.heartbeat();
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/heartbeat", baseUrl),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("goOffline sends POST to agent/offline", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.goOffline();
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/offline", baseUrl),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("agent live methods", () => {
    it("getPendingLive fetches pending live info", async () => {
      const mockLive = {
        slug: "abc",
        browserOffer: "offer-data",
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

      const result = await client.getPendingLive();
      expect(result).toEqual(mockLive);
    });

    it("getPendingLive returns null when no pending live", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ live: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getPendingLive();
      expect(result).toBeNull();
    });

    it("signalAnswer sends PATCH to agent/live/signal", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.signalAnswer({ slug: "abc", answer: "answer-data" });
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/live/signal", baseUrl),
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    it("closeActiveLive sends DELETE to agent/live", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.closeActiveLive();
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/live", baseUrl),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("getLive", () => {
    it("fetches live info by slug", async () => {
      const mockLive = {
        slug: "abc",
        status: "active",
        browserOffer: "offer",
        agentAnswer: "answer",
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
  });
});
