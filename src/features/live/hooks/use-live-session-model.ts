import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionState } from "~/features/live/types/live-types";
import { api } from "../../../../convex/_generated/api";

const SESSION_STORAGE_PREFIX = "pub-live-session:";

function getOrCreateSessionId(slug: string): string {
  const key = `${SESSION_STORAGE_PREFIX}${slug}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

export function useLiveSessionModel(slug: string) {
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const live = useQuery(api.pubs.getLiveBySlug, { slug });
  const agentOnline = useQuery(api.presence.isAgentOnline, { slug });

  const requestLiveMutation = useMutation(api.pubs.requestLive);
  const storeBrowserCandidatesMutation = useMutation(api.pubs.storeBrowserCandidates);
  const takeoverLiveMutation = useMutation(api.pubs.takeoverLive);

  const browserSessionId = useMemo(() => getOrCreateSessionId(slug), [slug]);
  const [wasConnected, setWasConnected] = useState(false);
  const [liveRequested, setLiveRequested] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset session state on slug navigation
  useEffect(() => {
    setWasConnected(false);
    setLiveRequested(false);
  }, [slug]);

  const sessionState: SessionState = useMemo(() => {
    if (!live) return "active";
    if (!live.browserSessionId || live.browserSessionId === browserSessionId) return "active";
    return wasConnected ? "taken-over" : "needs-takeover";
  }, [live, browserSessionId, wasConnected]);

  const storeBrowserOffer = useCallback(
    (input: { slug: string; offer: string }) => {
      return requestLiveMutation({
        slug: input.slug,
        browserSessionId,
        browserOffer: input.offer,
      });
    },
    [browserSessionId, requestLiveMutation],
  );

  const storeBrowserCandidates = useCallback(
    (input: { slug: string; candidates: string[] }) => {
      return storeBrowserCandidatesMutation({
        slug: input.slug,
        sessionId: browserSessionId,
        candidates: input.candidates,
      });
    },
    [browserSessionId, storeBrowserCandidatesMutation],
  );

  const takeoverLive = useCallback(() => {
    return takeoverLiveMutation({ slug, sessionId: browserSessionId });
  }, [browserSessionId, slug, takeoverLiveMutation]);

  const goLive = useCallback(() => {
    setLiveRequested(true);
  }, []);

  const markBridgeConnected = useCallback(() => {
    setWasConnected(true);
  }, []);

  return {
    agentOnline,
    goLive,
    live,
    liveRequested,
    markBridgeConnected,
    pub,
    sessionState,
    storeBrowserCandidates,
    storeBrowserOffer,
    takeoverLive,
  };
}
