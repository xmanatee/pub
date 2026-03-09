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

      await expect(client.create({ content: "test" })).rejects.toThrow(
        "Invalid API key",
      );
    });
  });

  describe("list", () => {
    it("fetches pubs list", async () => {
      const mockPubs = [
        {
          slug: "abc",
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

      await expect(client.listPage()).rejects.toThrow(
        "Invalid JSON response from server (HTTP 200).",
      );
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

      await client.goOnline({ daemonSessionId: "daemon-1", agentName: "Agent One" });
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/online", baseUrl),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ daemonSessionId: "daemon-1", agentName: "Agent One" }),
        }),
      );
    });

    it("heartbeat sends POST to agent/heartbeat", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.heartbeat({ daemonSessionId: "daemon-1" });
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/heartbeat", baseUrl),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ daemonSessionId: "daemon-1" }),
        }),
      );
    });

    it("goOffline sends POST to agent/offline", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.goOffline({ daemonSessionId: "daemon-1" });
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/offline", baseUrl),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ daemonSessionId: "daemon-1" }),
        }),
      );
    });
  });

  describe("agent live methods", () => {
    it("getLive fetches current live info", async () => {
      const mockLive = {
        slug: "abc",
        browserOffer: "offer-data",
        agentCandidates: [],
        browserCandidates: [],
        createdAt: 1000,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ live: mockLive }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getLive();
      expect(result).toEqual(mockLive);
    });

    it("getLive returns null when no live session exists", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ live: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getLive();
      expect(result).toBeNull();
    });

    it("getLive includes daemonSessionId query when provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ live: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.getLive("daemon-1");
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/live?daemonSessionId=daemon-1", baseUrl),
        expect.any(Object),
      );
    });

    it("signalAnswer sends PATCH to agent/live/signal", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.signalAnswer({
        slug: "abc",
        daemonSessionId: "daemon-1",
        answer: "answer-data",
      });
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/live/signal", baseUrl),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            slug: "abc",
            daemonSessionId: "daemon-1",
            answer: "answer-data",
          }),
        }),
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

    it("closeActiveLive includes daemonSessionId query when provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.closeActiveLive("daemon-1");
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/live?daemonSessionId=daemon-1", baseUrl),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("telegram bot token", () => {
    it("uploadBotToken sends PUT to agent/telegram-bot", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.uploadBotToken({ botToken: "123:ABC", botUsername: "mybot" });
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/telegram-bot", baseUrl),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ botToken: "123:ABC", botUsername: "mybot" }),
        }),
      );
    });

    it("deleteBotToken sends DELETE to agent/telegram-bot", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.deleteBotToken();
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/v1/agent/telegram-bot", baseUrl),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
