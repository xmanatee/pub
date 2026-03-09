import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  createPub: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  readPub: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 10 },
  listPubs: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 5 },
  updatePub: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 5 },
  deletePub: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  servePub: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 20 },
  signalLive: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  closeLive: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 6 },
  presenceHeartbeat: { kind: "token bucket", rate: 3, period: MINUTE, capacity: 3 },
  agentPollLive: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  telegramBotUpdate: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 2 },
});
