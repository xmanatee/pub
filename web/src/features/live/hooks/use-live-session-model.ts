import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveSelectedHost } from "~/features/live/model/agent-selection";
import type { SessionState } from "~/features/live/types/live-types";

const BROWSER_SESSION_STORAGE_KEY = "pub-live-browser-session";

function getOrCreateSessionId(): string {
  const key = BROWSER_SESSION_STORAGE_KEY;
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

function useRetainedQueryValue<T>(value: T | undefined, resetKey: string): T | undefined {
  const lastKeyRef = useRef(resetKey);
  const retainedRef = useRef<T | undefined>(value);

  if (lastKeyRef.current !== resetKey) {
    lastKeyRef.current = resetKey;
    retainedRef.current = value;
  } else if (value !== undefined) {
    retainedRef.current = value;
  }

  return value ?? retainedRef.current;
}

export function useLiveSessionModel(slug: string, defaultAgentName: string | null) {
  const liveQuery = useQuery(api.connections.getConnectionBySlug, { slug });
  const availableAgentsQuery = useQuery(api.presence.listAvailableForSlug, { slug });
  const live = useRetainedQueryValue(liveQuery, slug);
  const availableAgents = useRetainedQueryValue(availableAgentsQuery, slug);
  const agentOnline = availableAgents === undefined ? undefined : availableAgents.length > 0;

  const requestConnectionMutation = useMutation(api.connections.requestConnection);
  const storeBrowserCandidatesMutation = useMutation(api.connections.storeBrowserCandidates);
  const takeoverConnectionMutation = useMutation(api.connections.takeoverConnection);
  const closeConnectionMutation = useMutation(api.connections.closeConnectionByUser);

  const browserSessionId = useMemo(() => getOrCreateSessionId(), []);
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
    const resolved = resolveSelectedHost(availableAgents, selectedHostId, defaultAgentName);
    if (resolved !== selectedHostId) {
      setSelectedHostId(resolved);
    }
  }, [availableAgents, defaultAgentName, selectedHostId]);

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
    lastTakeoverAt: live?.takeoverAt,
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
