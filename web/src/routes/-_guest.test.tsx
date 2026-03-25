/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div>Guest route content</div>,
  createFileRoute: () => () => ({}),
}));

import { GuestLayout } from "./_guest";

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

describe("GuestLayout", () => {
  it("renders guest content without waiting on auth resolution", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<GuestLayout />);
    });

    expect(currentContainer.textContent).toContain("Guest route content");
    expect(currentContainer.textContent).not.toContain("Loading…");
  });
});
