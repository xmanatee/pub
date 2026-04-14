import { api } from "@backend/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

/**
 * Single source of truth for "create a draft pub and jump into the live session".
 * Used by the Pubs page and the global shell control bar so they share the same
 * disabled-when-offline / pending semantics and never drift apart.
 */
export function useStartLive() {
  const [pending, setPending] = useState(false);
  const createDraftForLive = useMutation(api.pubs.createDraftForLive);
  const agentOnline = useQuery(api.presence.isCurrentUserAgentOnline);
  const navigate = useNavigate();

  const startLive = useCallback(async () => {
    setPending(true);
    try {
      const { slug } = await createDraftForLive({});
      await navigate({ to: "/p/$slug", params: { slug } });
    } finally {
      setPending(false);
    }
  }, [createDraftForLive, navigate]);

  return { startLive, pending, agentOnline };
}
