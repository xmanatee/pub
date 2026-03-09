import { type LiveInfo, parseLiveInfo } from "../../../shared/live-api-core";

export interface CreateResult {
  slug: string;
  url: string;
}

export interface UpdateResult {
  slug: string;
  title?: string;
  isPublic: boolean;
  updatedAt: number;
}

export interface Pub {
  slug: string;
  title?: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  live?: {
    status: string;
  } | null;
}

export interface ListResult {
  pubs: Pub[];
  cursor?: string;
  hasMore: boolean;
}

export class PubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "PubApiError";
  }
}

export class PubApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getConvexCloudUrl(): string {
    return this.baseUrl.replace(/\.convex\.site$/, ".convex.cloud");
  }

  getApiKey(): string {
    return this.apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    const retryAfterHeader = res.headers.get("Retry-After");
    const parsedRetryAfterSeconds =
      typeof retryAfterHeader === "string" ? Number.parseInt(retryAfterHeader, 10) : undefined;
    const retryAfterSeconds =
      parsedRetryAfterSeconds !== undefined && Number.isFinite(parsedRetryAfterSeconds)
        ? parsedRetryAfterSeconds
        : undefined;

    const responseText = await res.text();
    let data: { error?: string } & Record<string, unknown>;
    if (responseText.trim().length === 0) {
      data = {};
    } else {
      try {
        data = JSON.parse(responseText) as { error?: string } & Record<string, unknown>;
      } catch {
        if (res.status === 429) {
          const retrySuffix =
            retryAfterSeconds !== undefined ? ` Retry after ${retryAfterSeconds}s.` : "";
          throw new PubApiError(
            `Rate limit exceeded.${retrySuffix}`,
            res.status,
            retryAfterSeconds,
          );
        }
        throw new PubApiError(
          `Invalid JSON response from server (HTTP ${res.status}).`,
          res.status,
          retryAfterSeconds,
        );
      }
    }

    if (!res.ok) {
      if (res.status === 429) {
        const retrySuffix =
          retryAfterSeconds !== undefined ? ` Retry after ${retryAfterSeconds}s.` : "";
        throw new PubApiError(`Rate limit exceeded.${retrySuffix}`, res.status, retryAfterSeconds);
      }
      throw new PubApiError(data.error || `Request failed with status ${res.status}`, res.status);
    }
    return data as T;
  }

  // -- Pub CRUD -------------------------------------------------------------

  async create(opts: {
    content?: string;
    title?: string;
    slug?: string;
  }): Promise<CreateResult> {
    return this.request<CreateResult>("/api/v1/pubs", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async get(slug: string): Promise<Pub & { content?: string }> {
    const data = await this.request<{
      pub: Pub & { content?: string };
    }>(`/api/v1/pubs/${encodeURIComponent(slug)}`);
    return data.pub;
  }

  async listPage(cursor?: string, limit?: number): Promise<ListResult> {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return this.request<ListResult>(`/api/v1/pubs${qs ? `?${qs}` : ""}`);
  }

  async list(): Promise<Pub[]> {
    const all: Pub[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.listPage(cursor, 100);
      all.push(...result.pubs);
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
    return all;
  }

  async update(opts: {
    slug: string;
    content?: string;
    title?: string;
    isPublic?: boolean;
    newSlug?: string;
  }): Promise<UpdateResult> {
    const { slug, newSlug, ...rest } = opts;
    const body: Record<string, unknown> = { ...rest };
    if (newSlug) body.slug = newSlug;
    return this.request<UpdateResult>(`/api/v1/pubs/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async deletePub(slug: string): Promise<void> {
    await this.request(`/api/v1/pubs/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
  }

  // -- Agent presence -------------------------------------------------------

  async goOnline(opts: { daemonSessionId: string; agentName?: string }): Promise<void> {
    await this.request("/api/v1/agent/online", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async heartbeat(opts: { daemonSessionId: string }): Promise<void> {
    await this.request("/api/v1/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async goOffline(opts: { daemonSessionId: string }): Promise<void> {
    await this.request("/api/v1/agent/offline", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  // -- Agent live management ------------------------------------------------

  async getLive(daemonSessionId?: string): Promise<LiveInfo | null> {
    const params = new URLSearchParams();
    if (daemonSessionId) {
      params.set("daemonSessionId", daemonSessionId);
    }
    const query = params.toString();
    const path = query ? `/api/v1/agent/live?${query}` : "/api/v1/agent/live";
    const data = await this.request<{ live: unknown }>(path);
    const live = parseLiveInfo(data.live);
    if (data.live !== null && data.live !== undefined && live === null) {
      throw new PubApiError("Invalid live snapshot response from server.", 502);
    }
    return live;
  }

  async signalAnswer(opts: {
    slug: string;
    daemonSessionId: string;
    answer?: string;
    candidates?: string[];
    agentName?: string;
  }): Promise<void> {
    await this.request("/api/v1/agent/live/signal", {
      method: "PATCH",
      body: JSON.stringify(opts),
    });
  }

  async closeActiveLive(daemonSessionId?: string): Promise<void> {
    const params = new URLSearchParams();
    if (daemonSessionId) {
      params.set("daemonSessionId", daemonSessionId);
    }
    const query = params.toString();
    const path = query ? `/api/v1/agent/live?${query}` : "/api/v1/agent/live";
    await this.request(path, { method: "DELETE" });
  }

  // -- Telegram bot token ---------------------------------------------------

  async uploadBotToken(opts: { botToken: string; botUsername: string }): Promise<void> {
    await this.request("/api/v1/agent/telegram-bot", {
      method: "PUT",
      body: JSON.stringify(opts),
    });
  }

  async deleteBotToken(): Promise<void> {
    await this.request("/api/v1/agent/telegram-bot", { method: "DELETE" });
  }
}
