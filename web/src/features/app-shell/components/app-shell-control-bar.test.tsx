/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@backend/_generated/api", () => ({
  api: {
    pubs: {
      createDraftForLive: "pubs:createDraftForLive",
      getLastViewedByUser: "pubs:getLastViewedByUser",
    },
    presence: {
      isCurrentUserAgentOnline: "presence:isCurrentUserAgentOnline",
      getOnlineAgentCount: "presence:getOnlineAgentCount",
    },
  },
}));

let mockAgentOnline: boolean | undefined = true;
let mockLastPub: { slug: string; title?: string } | null = null;
let mockMatch: (opts: { to: string }) => boolean = () => false;
const mockCreateDraft = vi.fn(async () => ({ slug: "fresh-pub" }));
const mockNavigate = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (ref: string, args?: unknown) => {
    if (args === "skip") return undefined;
    if (ref === "presence:isCurrentUserAgentOnline") return mockAgentOnline;
    if (ref === "presence:getOnlineAgentCount") return 0;
    if (ref === "pubs:getLastViewedByUser") return mockLastPub;
    return undefined;
  },
  useMutation: () => mockCreateDraft,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params?: { slug?: string };
    children: React.ReactNode;
  }) => (
    <a href={params?.slug ? to.replace("$slug", params.slug) : to}>{children}</a> // no-raw-anchor-ok
  ),
  useNavigate: () => mockNavigate,
  useMatchRoute: () => (opts: { to: string }) => mockMatch(opts),
  useMatches: () => [{ routeId: "/_authenticated/pubs" }],
}));

import { ControlBarSandbox } from "~/components/control-bar/control-bar-controller";
import { AppShellControlBar } from "./app-shell-control-bar";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockAgentOnline = true;
  mockLastPub = null;
  mockMatch = () => false;
  mockCreateDraft.mockClear();
  mockNavigate.mockClear();
});

afterEach(async () => {
  const current = root;
  if (current) {
    await act(async () => {
      current.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

async function render() {
  const current = root;
  const currentContainer = container;
  if (!current || !currentContainer) throw new Error("root not initialized");
  await act(async () => {
    current.render(
      <ControlBarSandbox>
        <AppShellControlBar />
      </ControlBarSandbox>,
    );
  });
  return currentContainer;
}

describe("AppShellControlBar", () => {
  it("renders the New action", async () => {
    const el = await render();
    expect(el.innerHTML).toContain("New");
    expect(el.innerHTML).toContain('aria-label="Create a new pub"');
  });

  it("disables New when the agent is offline", async () => {
    mockAgentOnline = false;
    const el = await render();
    const newBtn = el.querySelector('[aria-label="Agent offline"]') as HTMLButtonElement | null;
    expect(newBtn).not.toBeNull();
    expect(newBtn?.disabled).toBe(true);
  });

  it("surfaces the last-viewed pub as Resume", async () => {
    mockLastPub = { slug: "slug-a", title: "My pub" };
    const el = await render();
    expect(el.innerHTML).toContain("Resume");
    expect(el.innerHTML).toContain("My pub");
    const link = el.querySelector('a[href="/p/slug-a"]');
    expect(link).not.toBeNull();
  });

  it("hides Resume when the current route is the last-viewed pub", async () => {
    mockLastPub = { slug: "slug-a", title: "My pub" };
    mockMatch = ({ to }) => to === "/p/$slug";
    const el = await render();
    expect(el.innerHTML).not.toContain("Resume");
  });

  it("hides Resume while the user is on the pubs list", async () => {
    mockLastPub = { slug: "slug-a", title: "My pub" };
    mockMatch = ({ to }) => to === "/pubs";
    const el = await render();
    expect(el.innerHTML).not.toContain("Resume");
  });

  it("creates a draft and navigates when New is clicked", async () => {
    const el = await render();
    const btn = el.querySelector('[aria-label="Create a new pub"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    expect(mockCreateDraft).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/p/$slug", params: { slug: "fresh-pub" } });
  });

  it("opens and closes the nav menu from the status button", async () => {
    const el = await render();
    const openBtn = el.querySelector('[aria-label="Open menu"]') as HTMLButtonElement;
    expect(openBtn).not.toBeNull();
    await act(async () => {
      openBtn.click();
    });
    expect(el.innerHTML).toContain("Pubs");
    expect(el.innerHTML).toContain("Agents");
    expect(el.innerHTML).toContain("Settings");
    expect(el.querySelector('[aria-label="Close menu"]')).not.toBeNull();

    const closeBtn = el.querySelector('[aria-label="Close menu"]') as HTMLButtonElement;
    await act(async () => {
      closeBtn.click();
    });
    expect(el.querySelector('[aria-label="Open menu"]')).not.toBeNull();
  });
});
