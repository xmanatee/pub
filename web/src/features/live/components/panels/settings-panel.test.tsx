/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const liveSessionState = vi.hoisted(() => ({
  value: {
    autoFullscreen: false,
    autoOpenCanvas: true,
    availableAgents: [
      {
        hostId: "host-1",
        agentName: "codex",
        liveProfiles: [
          { id: "default", label: "Default" },
          {
            id: "dumb",
            label: "Dumb",
            description: "Low reasoning effort for cheaper, simpler live turns.",
          },
          {
            id: "fast",
            label: "Fast",
            description: "Fast service tier for faster live responses with increased usage.",
          },
        ],
      },
    ],
    canUseDeveloperMode: false,
    clearFiles: vi.fn(),
    clearMessages: vi.fn(),
    defaultAgentName: "codex",
    developerModeEnabled: false,
    files: [],
    hasCanvasContent: false,
    liveProfilesByAgent: {},
    messages: [],
    selectedHostId: "host-1",
    setAutoFullscreen: vi.fn(),
    setAutoOpenCanvas: vi.fn(),
    setDefaultAgentName: vi.fn(),
    setDeveloperModeEnabled: vi.fn(),
    setLiveProfileForAgent: vi.fn(),
    setSelectedHostId: vi.fn(),
    setVoiceModeEnabled: vi.fn(),
    voiceModeEnabled: false,
  },
}));

vi.mock("~/features/pub/contexts/live-session-context", () => ({
  useLiveSession: () => liveSessionState.value,
}));

vi.mock("~/hooks/use-fullscreen", () => ({
  isFullscreenSupported: () => false,
}));

import { SettingsPanel } from "./settings-panel";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SettingsPanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

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

  it("renders advertised live profiles without a separate daemon default choice", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<SettingsPanel />);
    });

    const html = currentContainer.innerHTML;
    expect(html).toContain("Default");
    expect(html).toContain("Dumb");
    expect(html).toContain("Fast");
    expect(html).not.toContain("Daemon default");
    expect(html).not.toContain("codex");
  });
});
