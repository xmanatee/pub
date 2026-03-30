/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFullscreenSupported, useFullscreen } from "./use-fullscreen";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("isFullscreenSupported", () => {
  it("returns false when requestFullscreen is not available", () => {
    expect(document.documentElement.requestFullscreen).toBeUndefined();
    expect(isFullscreenSupported()).toBe(false);
  });

  it("returns true when requestFullscreen is available", () => {
    document.documentElement.requestFullscreen = vi.fn();
    try {
      expect(isFullscreenSupported()).toBe(true);
    } finally {
      // biome-ignore lint/performance/noDelete: restoring jsdom default
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    }
  });
});

describe("useFullscreen", () => {
  let result: ReturnType<typeof useFullscreen>;
  let root: Root;
  let container: HTMLDivElement;

  function HookConsumer() {
    result = useFullscreen();
    return null;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    // biome-ignore lint/performance/noDelete: restoring jsdom default
    delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    // biome-ignore lint/performance/noDelete: restoring jsdom default
    delete (document as unknown as Record<string, unknown>).exitFullscreen;
  });

  describe("when Fullscreen API is not available", () => {
    beforeEach(async () => {
      await act(async () => root.render(<HookConsumer />));
    });

    it("reports isSupported as false", () => {
      expect(result.isSupported).toBe(false);
    });

    it("reports isFullscreen as false", () => {
      expect(result.isFullscreen).toBe(false);
    });

    it("requestFullscreen does not throw", () => {
      expect(() => result.requestFullscreen()).not.toThrow();
    });

    it("exitFullscreen does not throw", () => {
      expect(() => result.exitFullscreen()).not.toThrow();
    });
  });

  describe("when Fullscreen API is available", () => {
    let mockRequest: ReturnType<typeof vi.fn>;
    let mockExit: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      mockRequest = vi.fn().mockResolvedValue(undefined);
      mockExit = vi.fn().mockResolvedValue(undefined);
      document.documentElement.requestFullscreen = mockRequest;
      document.exitFullscreen = mockExit;
      await act(async () => root.render(<HookConsumer />));
    });

    it("reports isSupported as true", () => {
      expect(result.isSupported).toBe(true);
    });

    it("requestFullscreen calls the DOM API", () => {
      act(() => result.requestFullscreen());
      expect(mockRequest).toHaveBeenCalledOnce();
    });

    it("requestFullscreen skips when already fullscreen", () => {
      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      });
      try {
        act(() => result.requestFullscreen());
        expect(mockRequest).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(document, "fullscreenElement", {
          value: null,
          configurable: true,
        });
      }
    });

    it("exitFullscreen calls the DOM API when in fullscreen", () => {
      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      });
      try {
        act(() => result.exitFullscreen());
        expect(mockExit).toHaveBeenCalledOnce();
      } finally {
        Object.defineProperty(document, "fullscreenElement", {
          value: null,
          configurable: true,
        });
      }
    });

    it("tracks fullscreen state via fullscreenchange events", async () => {
      expect(result.isFullscreen).toBe(false);

      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      });
      await act(async () => {
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      expect(result.isFullscreen).toBe(true);

      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        configurable: true,
      });
      await act(async () => {
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      expect(result.isFullscreen).toBe(false);
    });
  });
});
