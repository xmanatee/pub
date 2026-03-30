/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ControlBarHost,
  ControlBarProvider,
} from "~/components/control-bar/control-bar-controller";
import { TooltipProvider } from "~/components/ui/tooltip";
import { FullscreenPromptLayer } from "./fullscreen-prompt-layer";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockFullscreen = {
  isSupported: true,
  isFullscreen: false,
  requestFullscreen: vi.fn(),
  exitFullscreen: vi.fn(),
};

const mockSession = {
  autoFullscreen: true,
};

let mockInTelegram = false;

vi.mock("~/hooks/use-fullscreen", () => ({
  useFullscreen: () => mockFullscreen,
}));

vi.mock("~/features/pub/contexts/live-session-context", () => ({
  useLiveSession: () => mockSession,
}));

vi.mock("~/lib/telegram", () => ({
  get IN_TELEGRAM() {
    return mockInTelegram;
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockFullscreen.isSupported = true;
  mockFullscreen.isFullscreen = false;
  mockFullscreen.requestFullscreen = vi.fn();
  mockFullscreen.exitFullscreen = vi.fn();
  mockSession.autoFullscreen = true;
  mockInTelegram = false;
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

async function render(slug = "test-pub") {
  const currentRoot = root;
  const currentContainer = container;
  if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

  await act(async () => {
    currentRoot.render(
      <TooltipProvider>
        <ControlBarProvider>
          <FullscreenPromptLayer slug={slug} />
          <ControlBarHost />
        </ControlBarProvider>
      </TooltipProvider>,
    );
  });

  return currentContainer;
}

describe("FullscreenPromptLayer", () => {
  it("shows fullscreen prompt when autoFullscreen is enabled", async () => {
    const el = await render();
    expect(el.innerHTML).toContain("Enter fullscreen?");
    expect(el.innerHTML).toContain('aria-label="Fullscreen"');
    expect(el.innerHTML).toContain('aria-label="Dismiss"');
  });

  it("does not show when autoFullscreen is disabled", async () => {
    mockSession.autoFullscreen = false;
    const el = await render();
    expect(el.innerHTML).not.toContain("Enter fullscreen?");
  });

  it("does not show in Telegram", async () => {
    mockInTelegram = true;
    const el = await render();
    expect(el.innerHTML).not.toContain("Enter fullscreen?");
  });

  it("does not show when fullscreen is not supported", async () => {
    mockFullscreen.isSupported = false;
    const el = await render();
    expect(el.innerHTML).not.toContain("Enter fullscreen?");
  });

  it("does not show when already in fullscreen", async () => {
    mockFullscreen.isFullscreen = true;
    const el = await render();
    expect(el.innerHTML).not.toContain("Enter fullscreen?");
  });

  it("dismisses when Dismiss is clicked", async () => {
    const el = await render();
    expect(el.innerHTML).toContain("Enter fullscreen?");

    const dismissBtn = el.querySelector('[aria-label="Dismiss"]') as HTMLButtonElement;
    await act(async () => {
      dismissBtn.click();
    });

    expect(el.innerHTML).not.toContain("Enter fullscreen?");
  });

  it("calls requestFullscreen and dismisses when Fullscreen is clicked", async () => {
    const el = await render();

    const fullscreenBtn = el.querySelector('[aria-label="Fullscreen"]') as HTMLButtonElement;
    await act(async () => {
      fullscreenBtn.click();
    });

    expect(mockFullscreen.requestFullscreen).toHaveBeenCalledOnce();
    expect(el.innerHTML).not.toContain("Enter fullscreen?");
  });

  it("resets dismissed state when slug changes", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(
        <TooltipProvider>
          <ControlBarProvider>
            <FullscreenPromptLayer slug="pub-a" />
            <ControlBarHost />
          </ControlBarProvider>
        </TooltipProvider>,
      );
    });

    // Dismiss
    const dismissBtn = currentContainer.querySelector(
      '[aria-label="Dismiss"]',
    ) as HTMLButtonElement;
    await act(async () => {
      dismissBtn.click();
    });
    expect(currentContainer.innerHTML).not.toContain("Enter fullscreen?");

    // Change slug — prompt should reappear
    await act(async () => {
      currentRoot.render(
        <TooltipProvider>
          <ControlBarProvider>
            <FullscreenPromptLayer slug="pub-b" />
            <ControlBarHost />
          </ControlBarProvider>
        </TooltipProvider>,
      );
    });
    expect(currentContainer.innerHTML).toContain("Enter fullscreen?");
  });
});
