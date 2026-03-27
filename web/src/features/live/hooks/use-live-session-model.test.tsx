/** @vitest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryState = vi.hoisted(() => ({
  availableAgents: undefined as
    | Array<{
        agentName: string;
        hostId: string;
      }>
    | undefined,
  live: undefined as
    | {
        _id: string;
        agentCandidates: string[];
        browserSessionId?: string;
        takeoverAt?: number;
      }
    | null
    | undefined,
}));

const mutationMock = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@backend/_generated/api", () => ({
  api: {
    connections: {
      closeConnectionByUser: { name: "closeConnectionByUser" },
      getConnectionBySlug: { name: "getConnectionBySlug" },
      requestConnection: { name: "requestConnection" },
      storeBrowserCandidates: { name: "storeBrowserCandidates" },
      takeoverConnection: { name: "takeoverConnection" },
    },
    presence: {
      listAvailableForSlug: { name: "listAvailableForSlug" },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: () => mutationMock,
  useQuery: (reference: { name?: string }) => {
    if (reference.name === "getConnectionBySlug") return queryState.live;
    if (reference.name === "listAvailableForSlug") return queryState.availableAgents;
    return undefined;
  },
}));

import { useLiveSessionModel } from "./use-live-session-model";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({
  defaultAgentName = null,
  onChange,
  slug = "demo",
}: {
  defaultAgentName?: string | null;
  onChange: (value: ReturnType<typeof useLiveSessionModel>) => void;
  slug?: string;
}) {
  const value = useLiveSessionModel(slug, defaultAgentName);

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return null;
}

describe("useLiveSessionModel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    queryState.live = undefined;
    queryState.availableAgents = undefined;
    mutationMock.mockClear();
    sessionStorage.clear();
    vi.stubGlobal("crypto", {
      randomUUID: () => "session-a",
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
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

  it("retains the last live snapshot and agent list across temporary query disconnects", async () => {
    const states: Array<ReturnType<typeof useLiveSessionModel>> = [];

    queryState.live = {
      _id: "live-1",
      agentCandidates: [],
      browserSessionId: "session-a",
      takeoverAt: 123,
    };
    queryState.availableAgents = [{ hostId: "presence-1", agentName: "Agent" }];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.live?._id).toBe("live-1");
    expect(states.at(-1)?.agentOnline).toBe(true);
    expect(states.at(-1)?.selectedHostId).toBe("presence-1");
    expect(states.at(-1)?.lastTakeoverAt).toBe(123);

    queryState.live = undefined;
    queryState.availableAgents = undefined;

    await act(async () => {
      root?.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.live?._id).toBe("live-1");
    expect(states.at(-1)?.availableAgents).toEqual([{ hostId: "presence-1", agentName: "Agent" }]);
    expect(states.at(-1)?.agentOnline).toBe(true);
    expect(states.at(-1)?.selectedHostId).toBe("presence-1");
    expect(states.at(-1)?.lastTakeoverAt).toBe(123);
  });

  it("replaces retained snapshots when queries report explicit empty values", async () => {
    const states: Array<ReturnType<typeof useLiveSessionModel>> = [];

    queryState.live = {
      _id: "live-1",
      agentCandidates: [],
      browserSessionId: "session-a",
    };
    queryState.availableAgents = [{ hostId: "presence-1", agentName: "Agent" }];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    queryState.live = null;
    queryState.availableAgents = [];

    await act(async () => {
      root?.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.live).toBeNull();
    expect(states.at(-1)?.availableAgents).toEqual([]);
    expect(states.at(-1)?.agentOnline).toBe(false);
  });

  it("reuses the same browser session id after navigating to another pub in the same tab", async () => {
    const states: Array<ReturnType<typeof useLiveSessionModel>> = [];

    queryState.live = null;
    queryState.availableAgents = [{ hostId: "presence-1", agentName: "Agent" }];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness slug="pub-a" onChange={(value) => states.push(value)} />);
    });

    await act(async () => {
      await states.at(-1)?.storeBrowserOffer({ slug: "pub-a", offer: "offer-a" });
    });

    expect(mutationMock).toHaveBeenCalledWith({
      browserOffer: "offer-a",
      browserSessionId: "session-a",
      hostId: "presence-1",
      slug: "pub-a",
    });

    mutationMock.mockClear();

    await act(async () => {
      root?.render(<HookHarness slug="pub-b" onChange={(value) => states.push(value)} />);
    });

    await act(async () => {
      await states.at(-1)?.storeBrowserOffer({ slug: "pub-b", offer: "offer-b" });
    });

    expect(mutationMock).toHaveBeenCalledWith({
      browserOffer: "offer-b",
      browserSessionId: "session-a",
      hostId: "presence-1",
      slug: "pub-b",
    });
  });
});
