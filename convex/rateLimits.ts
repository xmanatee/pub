import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  createPub: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  readPub: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 10 },
  listPubs: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 5 },
  updatePub: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 5 },
  deletePub: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  servePub: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 20 },
  openLive: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 3 },
  readLive: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  signalLive: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  closeLive: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 6 },
});
