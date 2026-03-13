import { describe, expect, it, vi } from "vitest";
import {
  LiveConnectionPreparationError,
  prepareMobileLiveConnection,
} from "./mobile-live-preparation";

describe("prepareMobileLiveConnection", () => {
  it("skips non-iPhone platforms", async () => {
    const getUserMedia = vi.fn();

    await expect(
      prepareMobileLiveConnection({
        platform: {
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15",
        },
        getUserMedia,
      }),
    ).resolves.toBe(false);

    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("warms microphone access for iPhone WebKit sessions", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }));

    await expect(
      prepareMobileLiveConnection({
        platform: {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Version/18.3 Mobile/15E148 Safari/604.1",
        },
        getUserMedia,
      }),
    ).resolves.toBe(true);

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("throws a targeted error when microphone permission is denied", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });

    await expect(
      prepareMobileLiveConnection({
        platform: {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Version/18.3 Mobile/15E148 Safari/604.1",
        },
        getUserMedia,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<LiveConnectionPreparationError>>({
        message:
          "On iPhone, live connection needs microphone access before it can connect. Allow mic access and try again.",
        name: "LiveConnectionPreparationError",
      }),
    );
  });
});
