import { afterEach, describe, expect, it, vi } from "vitest";

function makeSdkMock(overrides?: {
  isTMA?: () => boolean;
  retrieveLaunchParams?: () => { tgWebAppStartParam?: string };
  retrieveRawInitData?: () => string | undefined;
}) {
  return {
    backButton: { mount: { ifAvailable: vi.fn() } },
    initData: { restore: vi.fn() },
    init: vi.fn(),
    isTMA: overrides?.isTMA ?? (() => true),
    miniApp: {
      mountSync: { ifAvailable: vi.fn() },
      isDark: vi.fn(() => false),
      ready: { ifAvailable: vi.fn() },
    },
    openLink: Object.assign(vi.fn(), { isAvailable: vi.fn(() => false) }),
    popup: {
      show: Object.assign(vi.fn(), { isAvailable: vi.fn(() => false) }),
    },
    retrieveLaunchParams:
      overrides?.retrieveLaunchParams ?? (() => ({ tgWebAppStartParam: "p_from-sdk" })),
    retrieveRawInitData: overrides?.retrieveRawInitData ?? (() => "raw-init-data"),
    swipeBehavior: {
      mount: { ifAvailable: vi.fn() },
      disableVertical: { ifAvailable: vi.fn() },
    },
    themeParams: {
      mountSync: { ifAvailable: vi.fn() },
      bindCssVars: { ifAvailable: vi.fn() },
    },
    viewport: {
      mount: Object.assign(
        vi.fn(async () => {}),
        { isAvailable: vi.fn(() => false) },
      ),
      bindCssVars: { ifAvailable: vi.fn() },
      expand: { ifAvailable: vi.fn() },
      requestFullscreen: Object.assign(
        vi.fn(async () => {}),
        { isAvailable: vi.fn(() => false) },
      ),
    },
  };
}

async function loadTelegramModule(opts?: {
  isTMA?: () => boolean;
  retrieveLaunchParams?: () => { tgWebAppStartParam?: string };
  retrieveRawInitData?: () => string | undefined;
}) {
  vi.resetModules();
  vi.doMock("@telegram-apps/sdk-react", () =>
    makeSdkMock({
      isTMA: opts?.isTMA,
      retrieveLaunchParams: opts?.retrieveLaunchParams,
      retrieveRawInitData: opts?.retrieveRawInitData,
    }),
  );
  return import("./telegram");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@telegram-apps/sdk-react");
});

describe("telegram helpers", () => {
  it("uses isTMA as the Telegram environment source", async () => {
    const mod = await loadTelegramModule({ isTMA: () => false });
    expect(mod.IN_TELEGRAM).toBe(false);
    expect(mod.getTelegramInitData()).toBeNull();
    expect(mod.getTelegramStartParam()).toBeNull();
  });

  it("reads init data from SDK when in Telegram", async () => {
    const mod = await loadTelegramModule({
      isTMA: () => true,
      retrieveRawInitData: () => "abc123",
    });
    expect(mod.getTelegramInitData()).toBe("abc123");
  });

  it("returns null start param when launch params retrieval fails", async () => {
    const mod = await loadTelegramModule({
      isTMA: () => true,
      retrieveLaunchParams: () => {
        throw new Error("launch params unavailable");
      },
    });
    expect(mod.getTelegramStartParam()).toBeNull();
  });
});
