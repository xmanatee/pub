import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionState } from "~/features/live/types/live-types";

const SESSION_STORAGE_PREFIX = "pub-live-session:";
const MAX_CONNECTION_RETRIES = 3;
const CONNECTION_RETRY_DELAY_MS = 3_000;

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
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedPresenceId, setSelectedPresenceId] = useState<Id<"agentPresence"> | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAgentOnlineRef = useRef<boolean | undefined>(undefined);

  const resetSession = useCallback(() => {
    setWasConnected(false);
    setSessionError(null);
    setSelectedPresenceId(null);
    setConnectionAttempt(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const prev = prevAgentOnlineRef.current;
    prevAgentOnlineRef.current = agentOnline;
    if (prev === false && agentOnline === true) {
      setConnectionAttempt(0);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }
  }, [agentOnline]);

  useEffect(() => {
    if (!availableAgents) return;
    if (availableAgents.length === 0) {
      setSelectedPresenceId(null);
      return;
    }
    const stillAvailable = availableAgents.some(
      (agent: { presenceId: Id<"agentPresence"> }) => agent.presenceId === selectedPresenceId,
    );
    if (stillAvailable) return;
    if (availableAgents.length === 1) {
      setSelectedPresenceId(availableAgents[0].presenceId);
    } else {
      setSelectedPresenceId(null);
    }
  }, [availableAgents, selectedPresenceId]);

  const sessionState: SessionState = useMemo(() => {
    if (!live) return "inactive";
    if (!live.browserSessionId || live.browserSessionId === browserSessionId) return "active";
    return wasConnected ? "taken-over" : "needs-takeover";
  }, [live, browserSessionId, wasConnected]);

  const storeBrowserOffer = useCallback(
    async (input: { slug: string; offer: string }) => {
      if (!selectedPresenceId) throw new Error("No agent selected");
      try {
        const result = await requestLiveMutation({
          slug: input.slug,
          browserSessionId,
          browserOffer: input.offer,
          targetPresenceId: selectedPresenceId,
        });
        setSessionError(null);
        return result;
      } catch (error) {
        setSessionError(errorMessage(error));
        if (connectionAttempt < MAX_CONNECTION_RETRIES) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            setConnectionAttempt((prev) => prev + 1);
          }, CONNECTION_RETRY_DELAY_MS);
        }
        throw error;
      }
    },
    [browserSessionId, connectionAttempt, requestLiveMutation, selectedPresenceId],
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

  const closeLive = useCallback(() => {
    setSessionError(null);
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

  const restartSession = useCallback(() => {
    setWasConnected(false);
    setSessionError(null);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setConnectionAttempt((prev) => prev + 1);
  }, []);

  const retryConnection = useCallback(() => {
    setSessionError(null);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
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
    restartSession,
    resetSession,
    retryConnection,
    sessionState,
    sessionError,
    selectedPresenceId,
    setSelectedPresenceId,
    storeBrowserCandidates,
    storeBrowserOffer,
    takeoverLive,
  };
}
