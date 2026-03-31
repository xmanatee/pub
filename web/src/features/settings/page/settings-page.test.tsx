/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockSignOut = vi.fn(() => Promise.resolve());

vi.mock("@backend/_generated/api", () => ({
  api: {
    telegram: { getLinkedProviders: "telegram:getLinkedProviders" },
    linking: { createLinkToken: "linking:createLinkToken" },
    account: {
      disconnectProvider: "account:disconnectProvider",
      deleteAccount: "account:deleteAccount",
    },
    users: { isDeveloper: "users:isDeveloper" },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (q: string) => {
    if (q === "telegram:getLinkedProviders") {
      return [{ provider: "github", identifier: "user@test.com" }];
    }
    if (q === "users:isDeveloper") return false;
    return undefined;
  },
  useMutation: () => vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: mockSignOut }),
}));

vi.mock("~/hooks/use-fullscreen", () => ({
  isFullscreenSupported: () => false,
}));

vi.mock("~/hooks/use-developer-mode", () => ({
  useDeveloperMode: () => ({
    canUseDeveloperMode: false,
    developerModeEnabled: false,
    setDeveloperModeEnabled: vi.fn(),
  }),
}));

vi.mock("~/hooks/use-telemetry-preference", () => ({
  useTelemetryPreference: () => ({
    telemetryEnabled: true,
    setTelemetryEnabled: vi.fn(),
  }),
}));

vi.mock("~/features/live/hooks/use-live-preferences", () => ({
  useLivePreferences: () => ({
    autoFullscreen: false,
    setAutoFullscreen: vi.fn(),
  }),
}));

vi.mock("~/features/settings/components/live-model-settings-card", () => ({
  LiveModelSettingsCard: () => null,
}));

vi.mock("~/lib/analytics", () => ({
  resetIdentity: vi.fn(),
  trackSignOut: vi.fn(),
  trackProviderDisconnected: vi.fn(),
  trackAccountDeleted: vi.fn(),
}));

vi.mock("~/lib/auth-debug", () => ({
  pushAuthDebug: vi.fn(),
}));

vi.mock("~/lib/telegram", () => ({
  IN_TELEGRAM: false,
  telegramOpenLink: vi.fn(),
}));

import { SettingsPage } from "./settings-page";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  mockSignOut.mockClear();
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

describe("SettingsPage", () => {
  it("renders Session section with sign out button", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<SettingsPage />);
    });

    const html = currentContainer.innerHTML;
    expect(html).toContain("Session");
    expect(html).toContain("Sign out of your current session on this device.");
    expect(html).toContain("Sign out");
  });

  it("navigates to landing page on sign out", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<SettingsPage />);
    });

    const buttons = Array.from(currentContainer.querySelectorAll("button"));
    const signOutBtn = buttons.find((b) => b.textContent?.includes("Sign out"));
    expect(signOutBtn).toBeTruthy();

    await act(async () => {
      signOutBtn?.click();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  it("renders Linked Accounts, Telemetry, and Danger Zone sections", async () => {
    const currentRoot = root;
    const currentContainer = container;
    if (!currentRoot || !currentContainer) throw new Error("test root not initialized");

    await act(async () => {
      currentRoot.render(<SettingsPage />);
    });

    const html = currentContainer.innerHTML;
    expect(html).toContain("Linked Accounts");
    expect(html).toContain("Telemetry");
    expect(html).toContain("Danger Zone");
  });
});
