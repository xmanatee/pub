export interface CreateResult {
  slug: string;
  url: string;
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
  createdAt: number;
  updatedAt: number;
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

  async list(): Promise<Publication[]> {
    const data = await this.request<{ publications: Publication[] }>("/api/v1/publications");
    return data.publications;
  }

  async update(opts: {
    slug: string;
    content?: string;
    filename?: string;
    title?: string;
    isPublic?: boolean;
  }): Promise<UpdateResult> {
    const { slug, ...body } = opts;
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
