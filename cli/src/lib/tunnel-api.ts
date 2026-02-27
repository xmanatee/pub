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
  title?: string;
  agentOffer?: string;
  browserAnswer?: string;
  agentCandidates: string[];
  browserCandidates: string[];
  createdAt: number;
  expiresAt: number;
}

export interface TunnelListItem {
  tunnelId: string;
  title?: string;
  status: string;
  hasConnection: boolean;
  createdAt: number;
  expiresAt: number;
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
    let data: { error?: string } & Record<string, unknown>;
    try {
      data = (await res.json()) as { error?: string } & Record<string, unknown>;
    } catch {
      data = {};
    }
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data as T;
  }

  async create(opts: { title?: string; expiresIn?: string }): Promise<TunnelCreateResult> {
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
