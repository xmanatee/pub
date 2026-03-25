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
    presence: {
      getOnlineAgentCount: "presence:getOnlineAgentCount",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: () => 2,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <div data-href={to}>{children}</div>
  ),
  useMatchRoute: () => () => false,
}));

import { AppNav } from "./app-nav";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
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

describe("AppNav", () => {
  it("renders Pubs, Agents, Explore links and Settings icon", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<AppNav />);
    });

    const html = currentContainer.innerHTML;
    expect(html).toContain("Pubs");
    expect(html).toContain("Agents");
    expect(html).toContain("Explore");
    expect(html).toContain("Settings");
  });

  it("shows online agent count badge next to Agents", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<AppNav />);
    });

    const html = currentContainer.innerHTML;
    expect(html).toContain("2");
  });

  it("renders correct nav links", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<AppNav />);
    });

    const links = currentContainer.querySelectorAll("[data-href]");
    const hrefs = Array.from(links).map((el) => el.getAttribute("data-href"));
    expect(hrefs).toContain("/pubs");
    expect(hrefs).toContain("/agents");
    expect(hrefs).toContain("/explore");
    expect(hrefs).toContain("/settings");
  });
});
