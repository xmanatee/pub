import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  createPublication: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  readPublication: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 10 },
  listPublications: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 5 },
  updatePublication: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 5 },
  deletePublication: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  serveContent: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 20 },
  // Fresh keys reset exhausted tunnel buckets after deployment.
  createTunnelV2: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  tunnelSignalV2: { kind: "token bucket", rate: 600, period: MINUTE, capacity: 200 },
  readTunnelV2: { kind: "token bucket", rate: 600, period: MINUTE, capacity: 200 },
  closeTunnelV2: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
});
