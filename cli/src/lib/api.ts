export interface CreateResult {
  slug: string;
  url: string;
  expiresAt?: number;
}

export interface UpdateResult {
  slug: string;
  contentType: string;
  title?: string;
  isPublic: boolean;
  updatedAt: number;
}

export interface Publication {
  slug: string;
  contentType: string;
  title?: string;
  isPublic: boolean;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ListResult {
  publications: Publication[];
  cursor?: string;
  hasMore: boolean;
}

export class PubApiClient {
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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data as T;
  }

  async create(opts: {
    content: string;
    filename?: string;
    title?: string;
    slug?: string;
    isPublic?: boolean;
    expiresIn?: string;
  }): Promise<CreateResult> {
    return this.request<CreateResult>("/api/v1/publications", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async get(slug: string): Promise<Publication & { content: string }> {
    const data = await this.request<{
      publication: Publication & { content: string };
    }>(`/api/v1/publications/${encodeURIComponent(slug)}`);
    return data.publication;
  }

  async listPage(cursor?: string, limit?: number): Promise<ListResult> {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return this.request<ListResult>(`/api/v1/publications${qs ? `?${qs}` : ""}`);
  }

  async list(): Promise<Publication[]> {
    const all: Publication[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.listPage(cursor, 100);
      all.push(...result.publications);
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
    return this.request<UpdateResult>(`/api/v1/publications/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async remove(slug: string): Promise<void> {
    await this.request(`/api/v1/publications/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
  }
}
