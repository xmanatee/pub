export interface PublishResult {
  slug: string;
  updated: boolean;
  url: string;
}

export interface Publication {
  slug: string;
  filename: string;
  contentType: string;
  title?: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export class PublishApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
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

  async publish(opts: {
    filename: string;
    content: string;
    title?: string;
    slug?: string;
    isPublic?: boolean;
  }): Promise<PublishResult> {
    return this.request<PublishResult>("/api/v1/publish", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async list(): Promise<Publication[]> {
    const data = await this.request<{ publications: Publication[] }>(
      "/api/v1/publications",
    );
    return data.publications;
  }

  async remove(slug: string): Promise<void> {
    await this.request(`/api/v1/publications?slug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
  }
}
