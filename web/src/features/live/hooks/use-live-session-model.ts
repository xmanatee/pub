import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionState } from "~/features/live/types/live-types";

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
  return "Connection request failed";
}

export function useLiveSessionModel(slug: string) {
  const live = useQuery(api.connections.getConnectionBySlug, { slug });
  const availableAgents = useQuery(api.presence.listAvailableForSlug, { slug });
  const agentOnline = availableAgents === undefined ? undefined : availableAgents.length > 0;

  const requestConnectionMutation = useMutation(api.connections.requestConnection);
  const storeBrowserCandidatesMutation = useMutation(api.connections.storeBrowserCandidates);
  const takeoverConnectionMutation = useMutation(api.connections.takeoverConnection);
  const closeConnectionMutation = useMutation(api.connections.closeConnectionByUser);

  const browserSessionId = useMemo(() => getOrCreateSessionId(slug), [slug]);
  const [wasConnected, setWasConnected] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<Id<"hosts"> | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const resetSession = useCallback(() => {
    setWasConnected(false);
    setSessionError(null);
    setSelectedHostId(null);
    setConnectionAttempt(0);
  }, []);

  useEffect(() => {
    if (!availableAgents) return;
    if (availableAgents.length === 0) {
      setSelectedHostId(null);
      return;
    }
    const stillAvailable = availableAgents.some(
      (agent: { hostId: Id<"hosts"> }) => agent.hostId === selectedHostId,
    );
    if (stillAvailable) return;
    if (availableAgents.length === 1) {
      setSelectedHostId(availableAgents[0].hostId);
    } else {
      setSelectedHostId(null);
    }
  }, [availableAgents, selectedHostId]);

  const sessionState: SessionState = useMemo(() => {
    if (!live) return "inactive";
    if (!live.browserSessionId || live.browserSessionId === browserSessionId) return "active";
    return wasConnected ? "taken-over" : "needs-takeover";
  }, [live, browserSessionId, wasConnected]);

  const storeBrowserOffer = useCallback(
    async (input: { slug: string; offer: string }) => {
      if (!selectedHostId) throw new Error("No agent selected");
      try {
        const result = await requestConnectionMutation({
          slug: input.slug,
          browserSessionId,
          browserOffer: input.offer,
          hostId: selectedHostId,
        });
        setSessionError(null);
        return result;
      } catch (error) {
        setSessionError(errorMessage(error));
        throw error;
      }
    },
    [browserSessionId, requestConnectionMutation, selectedHostId],
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
    return takeoverConnectionMutation({ slug, sessionId: browserSessionId })
      .then((result) => {
        setSessionError(null);
        return result;
      })
      .catch((error) => {
        setSessionError(errorMessage(error));
        throw error;
      });
  }, [browserSessionId, slug, takeoverConnectionMutation]);

  const closeLive = useCallback(() => {
    setSessionError(null);
    void closeConnectionMutation({ slug }).catch((error) => {
      setSessionError(errorMessage(error));
    });
  }, [closeConnectionMutation, slug]);

  const markBridgeConnected = useCallback(() => {
    setWasConnected(true);
  }, []);

  const clearSessionError = useCallback(() => {
    setSessionError(null);
  }, []);

  const retryConnection = useCallback(() => {
    setSessionError(null);
    setConnectionAttempt((prev) => prev + 1);
  }, []);

  return {
    availableAgents: availableAgents ?? [],
    agentOnline,
    clearSessionError,
    closeLive,
    connectionAttempt,
    live,
    markBridgeConnected,
    resetSession,
    retryConnection,
    sessionState,
    sessionError,
    selectedHostId,
    setSelectedHostId,
    storeBrowserCandidates,
    storeBrowserOffer,
    takeoverLive,
  };
}
