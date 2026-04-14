/** @vitest-environment jsdom */
import type { PaginationStatus } from "convex/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

let paginatedResult: {
  results: unknown[];
  status: PaginationStatus;
  loadMore: () => void;
} = { results: [], status: "LoadingFirstPage", loadMore: vi.fn() };

let apiKeys: unknown[] | undefined = [];
let agentOnline: boolean | undefined = false;
let lives: unknown[] | undefined = [];

vi.mock("@backend/_generated/api", () => ({
  api: {
    pubs: {
      listByUser: "pubs:listByUser",
      toggleVisibility: "pubs:toggleVisibility",
      deleteByUser: "pubs:deleteByUser",
      duplicateByUser: "pubs:duplicateByUser",
      createDraftForLive: "pubs:createDraftForLive",
    },
    presence: { isCurrentUserAgentOnline: "presence:isCurrentUserAgentOnline" },
    apiKeys: { list: "apiKeys:list" },
    connections: { listActiveConnections: "connections:listActiveConnections" },
  },
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => paginatedResult,
  useMutation: () => vi.fn(),
  useQuery: (q: string) => {
    if (q === "presence:isCurrentUserAgentOnline") return agentOnline;
    if (q === "apiKeys:list") return apiKeys;
    if (q === "connections:listActiveConnections") return lives;
    return undefined;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("~/hooks/use-developer-mode", () => ({
  useDeveloperMode: () => ({
    canUseDeveloperMode: false,
    developerModeEnabled: false,
    setDeveloperModeEnabled: vi.fn(),
  }),
}));

vi.mock("~/lib/analytics", () => ({
  trackError: vi.fn(),
  trackPubDeleted: vi.fn(),
  trackPubLinkCopied: vi.fn(),
  trackVisibilityToggled: vi.fn(),
  trackApiKeyCopied: vi.fn(),
  trackApiKeyCreated: vi.fn(),
}));

vi.mock("~/lib/telegram", () => ({
  telegramConfirm: vi.fn(),
  telegramOpenLink: vi.fn(),
}));

import { PubsPage } from "./pubs-page";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  paginatedResult = { results: [], status: "LoadingFirstPage", loadMore: vi.fn() };
  apiKeys = [];
  agentOnline = false;
  lives = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  const currentRoot = root;
  if (currentRoot) {
    await act(async () => {
      currentRoot.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

async function render() {
  const currentRoot = root;
  const currentContainer = container;
  if (!currentRoot || !currentContainer) throw new Error("test root not initialized");
  await act(async () => {
    currentRoot.render(<PubsPage />);
  });
  return currentContainer;
}

describe("PubsPage", () => {
  it("during LoadingFirstPage, renders skeleton cards with the sort chips mounted and no literal 'Loading' text", async () => {
    paginatedResult = { results: [], status: "LoadingFirstPage", loadMore: vi.fn() };
    apiKeys = [{ _id: "k1" }];

    const el = await render();

    expect(el.querySelectorAll("[data-testid='pub-card-skeleton']").length).toBeGreaterThan(0);
    expect(el.textContent).toContain("Most viewed");
    expect(el.textContent).not.toMatch(/Loading/i);
  });

  it("stays in loading state when api keys query has not resolved, even if pubs are exhausted", async () => {
    paginatedResult = { results: [], status: "Exhausted", loadMore: vi.fn() };
    apiKeys = undefined;

    const el = await render();

    expect(el.querySelectorAll("[data-testid='pub-card-skeleton']").length).toBeGreaterThan(0);
    expect(el.textContent).not.toMatch(/Loading/i);
    expect(el.textContent).not.toContain("No pubs yet");
    expect(el.textContent).not.toContain("Get started with Pub");
  });

  it("renders the onboarding guide when the user has no pubs and no api keys", async () => {
    paginatedResult = { results: [], status: "Exhausted", loadMore: vi.fn() };
    apiKeys = [];

    const el = await render();

    expect(el.textContent).toContain("Get started with Pub");
    expect(el.querySelector("[data-testid='pub-card-skeleton']")).toBeNull();
    expect(el.textContent).not.toMatch(/Loading/i);
  });

  it("renders the empty card with sort chips when the user has api keys but no pubs", async () => {
    paginatedResult = { results: [], status: "Exhausted", loadMore: vi.fn() };
    apiKeys = [{ _id: "k1" }];

    const el = await render();

    expect(el.textContent).toContain("No pubs yet");
    expect(el.textContent).toContain("Most viewed");
    expect(el.textContent).not.toMatch(/Loading/i);
  });
});
