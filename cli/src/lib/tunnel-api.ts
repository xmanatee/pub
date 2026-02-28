/**
 * HTTP API client for tunnel endpoints on pub.blue.
 */

export interface TunnelCreateResult {
  tunnelId: string;
  url: string;
  expiresAt: number;
}

export interface TunnelInfo {
  tunnelId: string;
  status: string;
  agentOffer?: string;
  browserAnswer?: string;
  agentCandidates: string[];
  browserCandidates: string[];
  createdAt: number;
  expiresAt: number;
}

export interface TunnelListItem {
  tunnelId: string;
  status: string;
  hasConnection: boolean;
  createdAt: number;
  expiresAt: number;
}

export class TunnelApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "TunnelApiError";
  }
}

export class TunnelApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

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
    let data: { error?: string } & Record<string, unknown>;
    try {
      data = (await res.json()) as { error?: string } & Record<string, unknown>;
    } catch {
      data = {};
    }
    if (!res.ok) {
      if (res.status === 429) {
        const retrySuffix =
          retryAfterSeconds !== undefined ? ` Retry after ${retryAfterSeconds}s.` : "";
        throw new TunnelApiError(`Rate limit exceeded.${retrySuffix}`, res.status, retryAfterSeconds);
      }
      throw new TunnelApiError(data.error || `Request failed: ${res.status}`, res.status);
    }
    return data as T;
  }

  async create(opts: { expiresIn?: string }): Promise<TunnelCreateResult> {
    return this.request<TunnelCreateResult>("/api/v1/tunnels", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async get(tunnelId: string): Promise<TunnelInfo> {
    const data = await this.request<{ tunnel: TunnelInfo }>(
      `/api/v1/tunnels/${encodeURIComponent(tunnelId)}`,
    );
    return data.tunnel;
  }

  async list(): Promise<TunnelListItem[]> {
    const data = await this.request<{ tunnels: TunnelListItem[] }>("/api/v1/tunnels/");
    return data.tunnels;
  }

  async signal(tunnelId: string, opts: { offer?: string; candidates?: string[] }): Promise<void> {
    await this.request(`/api/v1/tunnels/${encodeURIComponent(tunnelId)}/signal`, {
      method: "PATCH",
      body: JSON.stringify(opts),
    });
  }

  async close(tunnelId: string): Promise<void> {
    await this.request(`/api/v1/tunnels/${encodeURIComponent(tunnelId)}`, {
      method: "DELETE",
    });
  }
}
