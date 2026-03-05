export interface CreateResult {
  slug: string;
  url: string;
  expiresAt?: number;
}

export interface UpdateResult {
  slug: string;
  contentType?: string;
  title?: string;
  isPublic: boolean;
  updatedAt: number;
}

export interface Pub {
  slug: string;
  contentType?: string;
  title?: string;
  isPublic: boolean;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
  live?: {
    status: string;
    hasConnection: boolean;
    expiresAt: number;
  } | null;
}

export interface ListResult {
  pubs: Pub[];
  cursor?: string;
  hasMore: boolean;
}

export interface LiveInfo {
  slug: string;
  status?: string;
  browserOffer?: string;
  agentAnswer?: string;
  agentCandidates: string[];
  browserCandidates: string[];
  createdAt: number;
  expiresAt: number;
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
          throw new PubApiError(`Rate limit exceeded.${retrySuffix}`, res.status, retryAfterSeconds);
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
    filename?: string;
    title?: string;
    slug?: string;
    isPublic?: boolean;
    expiresIn?: string;
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
    filename?: string;
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

  async goOnline(): Promise<void> {
    await this.request("/api/v1/agent/online", { method: "POST" });
  }

  async heartbeat(): Promise<void> {
    await this.request("/api/v1/agent/heartbeat", { method: "POST" });
  }

  async goOffline(): Promise<void> {
    await this.request("/api/v1/agent/offline", { method: "POST" });
  }

  // -- Agent live management ------------------------------------------------

  async getPendingLive(): Promise<LiveInfo | null> {
    const data = await this.request<{ live: LiveInfo | null }>("/api/v1/agent/live");
    return data.live;
  }

  async signalAnswer(opts: {
    slug: string;
    answer?: string;
    candidates?: string[];
    agentName?: string;
  }): Promise<void> {
    await this.request("/api/v1/agent/live/signal", {
      method: "PATCH",
      body: JSON.stringify(opts),
    });
  }

  async closeActiveLive(): Promise<void> {
    await this.request("/api/v1/agent/live", { method: "DELETE" });
  }

  // -- Per-slug live info ---------------------------------------------------

  async getLive(slug: string): Promise<LiveInfo> {
    const data = await this.request<{ live: LiveInfo }>(
      `/api/v1/pubs/${encodeURIComponent(slug)}/live`,
    );
    return data.live;
  }
}
