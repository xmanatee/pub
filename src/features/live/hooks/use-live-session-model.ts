import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionState } from "~/features/live/types/live-types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const SESSION_STORAGE_PREFIX = "pub-live-session:";

function getOrCreateSessionId(slug: string): string {
  const key = `${SESSION_STORAGE_PREFIX}${slug}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === "string" && error.trim().length > 0) return error;
  return "Live request failed";
}

export function useLiveSessionModel(slug: string) {
  const live = useQuery(api.pubs.getLiveBySlug, { slug });
  const availableAgents = useQuery(api.presence.listAvailableForSlug, { slug });
  const agentOnline = availableAgents === undefined ? undefined : availableAgents.length > 0;

  const requestLiveMutation = useMutation(api.pubs.requestLive);
  const storeBrowserCandidatesMutation = useMutation(api.pubs.storeBrowserCandidates);
  const takeoverLiveMutation = useMutation(api.pubs.takeoverLive);
  const closeLiveMutation = useMutation(api.pubs.closeLiveByUser);

  const browserSessionId = useMemo(() => getOrCreateSessionId(slug), [slug]);
  const [wasConnected, setWasConnected] = useState(false);
  const [liveRequested, setLiveRequested] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedPresenceId, setSelectedPresenceId] = useState<Id<"agentPresence"> | null>(null);

  const resetSession = useCallback(() => {
    setWasConnected(false);
    setLiveRequested(false);
    setSessionError(null);
    setSelectedPresenceId(null);
  }, []);

  useEffect(() => {
    if (!availableAgents) return;
    if (availableAgents.length === 0) {
      setSelectedPresenceId(null);
      return;
    }
    const stillAvailable = availableAgents.some((agent) => agent.presenceId === selectedPresenceId);
    if (stillAvailable) return;
    const defaultPresenceId = availableAgents[0]?.presenceId ?? null;
    setSelectedPresenceId(defaultPresenceId);
  }, [availableAgents, selectedPresenceId]);

  const sessionState: SessionState = useMemo(() => {
    if (!live) return "inactive";
    if (!live.browserSessionId || live.browserSessionId === browserSessionId) return "active";
    return wasConnected ? "taken-over" : "needs-takeover";
  }, [live, browserSessionId, wasConnected]);

  const storeBrowserOffer = useCallback(
    async (input: { slug: string; offer: string }) => {
      try {
        const result = await requestLiveMutation({
          slug: input.slug,
          browserSessionId,
          browserOffer: input.offer,
          targetPresenceId: selectedPresenceId ?? undefined,
        });
        setSessionError(null);
        return result;
      } catch (error) {
        setSessionError(errorMessage(error));
        throw error;
      }
    },
    [browserSessionId, requestLiveMutation, selectedPresenceId],
  );

  const storeBrowserCandidates = useCallback(
    async (input: { slug: string; candidates: string[] }) => {
      try {
        const result = await storeBrowserCandidatesMutation({
          slug: input.slug,
          sessionId: browserSessionId,
          candidates: input.candidates,
        });
        setSessionError(null);
        return result;
      } catch (error) {
        setSessionError(errorMessage(error));
        throw error;
      }
    },
    [browserSessionId, storeBrowserCandidatesMutation],
  );

  const takeoverLive = useCallback(() => {
    return takeoverLiveMutation({ slug, sessionId: browserSessionId })
      .then((result) => {
        setSessionError(null);
        return result;
      })
      .catch((error) => {
        setSessionError(errorMessage(error));
        throw error;
      });
  }, [browserSessionId, slug, takeoverLiveMutation]);

  const startLive = useCallback(() => {
    setSessionError(null);
    setLiveRequested(true);
  }, []);

  const stopLive = useCallback(() => {
    setSessionError(null);
    setLiveRequested(false);
    void closeLiveMutation({ slug }).catch((error) => {
      setSessionError(errorMessage(error));
    });
  }, [closeLiveMutation, slug]);

  const markBridgeConnected = useCallback(() => {
    setWasConnected(true);
  }, []);

  const clearSessionError = useCallback(() => {
    setSessionError(null);
  }, []);

  return {
    availableAgents: availableAgents ?? [],
    agentOnline,
    clearSessionError,
    live,
    liveRequested,
    markBridgeConnected,
    resetSession,
    sessionState,
    sessionError,
    selectedPresenceId,
    setSelectedPresenceId,
    startLive,
    stopLive,
    storeBrowserCandidates,
    storeBrowserOffer,
    takeoverLive,
  };
}
