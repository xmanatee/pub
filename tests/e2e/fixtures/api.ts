/**
 * HTTP API client for E2E tests.
 * Wraps the Convex HTTP actions (REST API + agent routes + content serving).
 */
import { getState, type TestUser } from "./convex";

export class ApiClient {
  readonly baseUrl: string;
  readonly apiKey: string;

  constructor(opts?: { baseUrl?: string; apiKey?: string; user?: TestUser }) {
    const state = getState();
    this.baseUrl = opts?.baseUrl ?? state.convexSiteUrl;
    this.apiKey = opts?.apiKey ?? opts?.user?.apiKey ?? state.users[0]?.apiKey ?? "";
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // — Pub CRUD —

  async createPub(data: { slug?: string; content?: string; title?: string }): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/pubs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  async getPub(slug: string): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/pubs/${encodeURIComponent(slug)}`, {
      headers: this.headers(),
    });
  }

  async listPubs(): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/pubs`, {
      headers: this.headers(),
    });
  }

  async updatePub(
    slug: string,
    data: { content?: string; title?: string; isPublic?: boolean; slug?: string },
  ): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/pubs/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  async deletePub(slug: string): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/pubs/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // — Agent presence —

  async agentOnline(data: { daemonSessionId: string; agentName?: string }): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/agent/online`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  async agentHeartbeat(data: { daemonSessionId: string }): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/agent/heartbeat`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  async agentOffline(data: { daemonSessionId: string }): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1/agent/offline`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  // — Content serving —

  async servePub(slug: string): Promise<Response> {
    return fetch(`${this.baseUrl}/serve/${encodeURIComponent(slug)}`);
  }

  async getOgImage(slug: string): Promise<Response> {
    return fetch(`${this.baseUrl}/og/${encodeURIComponent(slug)}`);
  }

  async getRss(userId: string): Promise<Response> {
    return fetch(`${this.baseUrl}/rss/${userId}`);
  }
}
