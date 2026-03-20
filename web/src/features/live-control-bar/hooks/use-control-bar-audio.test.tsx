/** @vitest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useControlBarAudio } from "./use-control-bar-audio";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useControlBarAudio>) => void;
}) {
  const value = useControlBarAudio({
    disabled: false,
    ensureChannel: async () => true,
    sendBinaryOnChannel: () => true,
    sendOnChannel: () => true,
    onSendAudio: () => {},
  });

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

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

describe("useControlBarAudio", () => {
  it("does not request microphone access on mount", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onReady={() => {}} />);
    });

    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
