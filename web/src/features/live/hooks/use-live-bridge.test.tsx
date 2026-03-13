/** @vitest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { MockBrowserBridge, bridgeInstances } = vi.hoisted(() => {
  const bridgeInstances: Array<{ close: ReturnType<typeof vi.fn> }> = [];

  class MockBrowserBridge {
    readonly close = vi.fn();
    readonly createOffer = vi.fn(async () => "offer-sdp");
    readonly getIceCandidates = vi.fn((): string[] => []);
    readonly markOfferSent = vi.fn();
    readonly applyAnswer = vi.fn(async () => {});
    readonly addRemoteCandidates = vi.fn(async () => {});
    readonly setOnControlError = vi.fn();
    readonly setOnLiveReadyChange = vi.fn();
    readonly setOnStateChange = vi.fn();
    readonly setOnMessage = vi.fn();
    readonly setOnTrack = vi.fn();
    readonly setOnDeliveryReceipt = vi.fn();
    readonly setOnProfileMark = vi.fn();

    constructor() {
      bridgeInstances.push(this);
    }
  }

  return { MockBrowserBridge, bridgeInstances };
});

vi.mock("~/features/live/lib/webrtc-browser", () => ({
  BrowserBridge: MockBrowserBridge,
}));

import { useLiveBridge } from "./use-live-bridge";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({
  enabled,
  transportKey,
  onChange,
}: {
  enabled: boolean;
  transportKey: string;
  onChange: (value: ReturnType<typeof useLiveBridge>) => void;
}) {
  const value = useLiveBridge({
    slug: "demo",
    enabled,
    transportKey,
    agentAnswer: undefined,
    agentCandidates: undefined,
    storeBrowserOffer: async () => ({ ok: true }),
    storeBrowserCandidates: async () => ({ ok: true }),
    onDeliveryReceipt: () => {},
    onMessage: () => {},
    onTrackActivity: () => {},
  });

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  bridgeInstances.length = 0;
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
  bridgeInstances.length = 0;
});

describe("useLiveBridge", () => {
  it("recreates the browser bridge when the live target agent changes", async () => {
    const states: Array<ReturnType<typeof useLiveBridge>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          enabled={true}
          transportKey="demo:presence-a:0"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    expect(bridgeInstances).toHaveLength(1);
    const firstBridge = bridgeInstances[0];

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          enabled={true}
          transportKey="demo:presence-b:0"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    expect(firstBridge.close).toHaveBeenCalledTimes(1);
    expect(bridgeInstances).toHaveLength(2);
    expect(states.at(-1)?.bridgeState).toBe("connecting");
  });
});
