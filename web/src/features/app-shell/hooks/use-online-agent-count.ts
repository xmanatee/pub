import { api } from "@backend/_generated/api";
import { useQuery } from "convex/react";

/** Number of agents currently online; `undefined` while loading. */
export function useOnlineAgentCount(): number | undefined {
  return useQuery(api.presence.getOnlineAgentCount);
}
